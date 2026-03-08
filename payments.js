const router = require('express').Router();
const axios = require('axios');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Initialize payment
router.post('/initialize', authenticate, async (req, res) => {
  try {
    const { product_id } = req.body;
    const product = await db.query('SELECT * FROM products WHERE id=$1 AND is_active=TRUE', [product_id]);
    if (!product.rows[0]) return res.status(404).json({ error: 'Product not found' });

    // Check available slots
    const slotCheck = await db.query(
      `SELECT COUNT(*) FROM slots WHERE product_id=$1 AND status='available'`,
      [product_id]
    );
    if (parseInt(slotCheck.rows[0].count) === 0) {
      return res.status(400).json({ error: 'No available slots for this product' });
    }

    const amount = Math.round(product.rows[0].price * 100); // Paystack uses kobo

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: req.user.email,
        amount,
        metadata: {
          user_id: req.user.id,
          product_id,
          custom_fields: [
            { display_name: 'Product', value: product.rows[0].name },
            { display_name: 'User', value: req.user.email }
          ]
        },
        callback_url: `${process.env.FRONTEND_URL}/payment/callback`
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    // Save pending payment record
    await db.query(
      `INSERT INTO payments (user_id, amount, paystack_reference, metadata)
       VALUES ($1,$2,$3,$4)`,
      [req.user.id, product.rows[0].price, response.data.data.reference, JSON.stringify({ product_id })]
    );

    res.json({
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});

// Verify payment (called after redirect)
router.get('/verify/:reference', authenticate, async (req, res) => {
  try {
    const { reference } = req.params;
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const txn = response.data.data;
    if (txn.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful' });
    }

    // Check if already processed
    const existing = await db.query('SELECT * FROM payments WHERE paystack_reference=$1', [reference]);
    if (existing.rows[0]?.status === 'success') {
      return res.json({ message: 'Already processed', subscription_id: existing.rows[0].subscription_id });
    }

    const { user_id, product_id } = txn.metadata;
    const result = await assignSlotAndActivate(user_id, product_id, reference, txn.amount / 100, txn.id);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Shared slot assignment logic
async function assignSlotAndActivate(user_id, product_id, reference, amount, txn_id) {
  const client = await require('../db').pool.connect();
  try {
    await client.query('BEGIN');

    // Find product
    const product = await client.query('SELECT * FROM products WHERE id=$1', [product_id]);
    if (!product.rows[0]) throw new Error('Product not found');

    // Find first available slot
    const slot = await client.query(
      `SELECT * FROM slots WHERE product_id=$1 AND status='available' LIMIT 1 FOR UPDATE`,
      [product_id]
    );
    if (!slot.rows[0]) throw new Error('No available slots');

    // Get user's affiliate
    const user = await client.query('SELECT affiliate_id FROM users WHERE id=$1', [user_id]);
    const affiliateId = user.rows[0]?.affiliate_id;

    // Calculate expiry
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + product.rows[0].duration_days);

    // Create subscription
    const sub = await client.query(
      `INSERT INTO subscriptions (user_id, product_id, slot_id, expiry_date, status, payment_reference, amount_paid, affiliate_id)
       VALUES ($1,$2,$3,$4,'active',$5,$6,$7) RETURNING *`,
      [user_id, product_id, slot.rows[0].id, expiry.toISOString().split('T')[0], reference, amount, affiliateId]
    );

    // Mark slot as used
    await client.query(
      `UPDATE slots SET status='used', updated_at=NOW() WHERE id=$1`,
      [slot.rows[0].id]
    );

    // Update payment record
    await client.query(
      `UPDATE payments SET status='success', subscription_id=$1, paystack_transaction_id=$2 WHERE paystack_reference=$3`,
      [sub.rows[0].id, txn_id?.toString(), reference]
    );

    // Handle affiliate commission
    if (affiliateId && affiliateId !== user_id) {
      const commissionRate = product.rows[0].commission_rate || 20;
      const commission = (amount * commissionRate) / 100;
      await client.query(
        `INSERT INTO affiliate_commissions (affiliate_id, subscription_id, referred_user_id, product_id, amount, rate)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [affiliateId, sub.rows[0].id, user_id, product_id, commission, commissionRate]
      );
      await client.query(
        `UPDATE users SET affiliate_pending = affiliate_pending + $1 WHERE id=$2`,
        [commission, affiliateId]
      );
    }

    await client.query('COMMIT');
    return { subscription_id: sub.rows[0].id, message: 'Subscription activated' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = router;
module.exports.assignSlotAndActivate = assignSlotAndActivate;
