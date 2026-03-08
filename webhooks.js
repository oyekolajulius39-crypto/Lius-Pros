const router = require('express').Router();
const crypto = require('crypto');
const { assignSlotAndActivate } = require('./payments');

router.post('/paystack', async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto
    .createHmac('sha512', secret)
    .update(req.body)
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(req.body);
  res.sendStatus(200); // Acknowledge immediately

  if (event.event === 'charge.success') {
    const { reference, metadata, amount, id } = event.data;
    const { user_id, product_id } = metadata || {};
    if (!user_id || !product_id) return;

    try {
      await assignSlotAndActivate(user_id, product_id, reference, amount / 100, id);
      console.log(`✅ Webhook processed: ${reference}`);
    } catch (err) {
      console.error(`❌ Webhook error for ${reference}:`, err.message);
    }
  }
});

module.exports = router;
