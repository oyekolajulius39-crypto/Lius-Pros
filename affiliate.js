const router = require('express').Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Apply to become affiliate
router.post('/apply', authenticate, async (req, res) => {
  await db.query(
    `UPDATE users SET is_affiliate=TRUE, affiliate_status='pending' WHERE id=$1`,
    [req.user.id]
  );
  res.json({ message: 'Application submitted. Awaiting admin approval.' });
});

// Get affiliate dashboard
router.get('/dashboard', authenticate, async (req, res) => {
  const user = await db.query(
    `SELECT id, referral_code, affiliate_balance, affiliate_pending, affiliate_status FROM users WHERE id=$1`,
    [req.user.id]
  );
  if (!user.rows[0]?.affiliate_status === 'approved') {
    return res.status(403).json({ error: 'Not an approved affiliate' });
  }

  const [referrals, commissions, withdrawals] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM users WHERE affiliate_id=$1`, [req.user.id]),
    db.query(
      `SELECT ac.*, p.name as product_name, u.email as referred_email
       FROM affiliate_commissions ac
       JOIN products p ON p.id = ac.product_id
       JOIN users u ON u.id = ac.referred_user_id
       WHERE ac.affiliate_id=$1 ORDER BY ac.created_at DESC LIMIT 20`,
      [req.user.id]
    ),
    db.query(
      `SELECT * FROM withdrawal_requests WHERE affiliate_id=$1 ORDER BY created_at DESC LIMIT 10`,
      [req.user.id]
    )
  ]);

  res.json({
    user: user.rows[0],
    total_referrals: referrals.rows[0].count,
    commissions: commissions.rows,
    withdrawals: withdrawals.rows,
    referral_link: `${process.env.FRONTEND_URL}/register?ref=${user.rows[0].referral_code}`
  });
});

// Request withdrawal
router.post('/withdraw', authenticate, async (req, res) => {
  const { amount, bank_name, account_number, account_name } = req.body;
  const user = await db.query('SELECT affiliate_balance FROM users WHERE id=$1', [req.user.id]);
  if (user.rows[0].affiliate_balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  await db.query(
    `INSERT INTO withdrawal_requests (affiliate_id, amount, bank_name, account_number, account_name)
     VALUES ($1,$2,$3,$4,$5)`,
    [req.user.id, amount, bank_name, account_number, account_name]
  );
  res.json({ message: 'Withdrawal request submitted' });
});

// ─── ADMIN: Affiliate management ───────────────────────────
router.get('/admin/list', authenticate, requireAdmin, async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.full_name, u.affiliate_status, u.affiliate_balance,
     u.affiliate_pending, u.referral_code, u.created_at,
     COUNT(referred.id) as referral_count
     FROM users u
     LEFT JOIN users referred ON referred.affiliate_id = u.id
     WHERE u.is_affiliate = TRUE
     GROUP BY u.id ORDER BY u.created_at DESC`
  );
  res.json(rows);
});

router.put('/admin/:id/approve', authenticate, requireAdmin, async (req, res) => {
  await db.query(
    `UPDATE users SET affiliate_status='approved' WHERE id=$1`,
    [req.params.id]
  );
  res.json({ message: 'Affiliate approved' });
});

router.get('/admin/withdrawals', authenticate, requireAdmin, async (req, res) => {
  const { rows } = await db.query(
    `SELECT wr.*, u.email, u.full_name FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.affiliate_id
     ORDER BY wr.created_at DESC`
  );
  res.json(rows);
});

router.put('/admin/withdrawals/:id', authenticate, requireAdmin, async (req, res) => {
  const { status, admin_note } = req.body;
  const wr = await db.query('SELECT * FROM withdrawal_requests WHERE id=$1', [req.params.id]);
  if (!wr.rows[0]) return res.status(404).json({ error: 'Not found' });

  await db.query(
    `UPDATE withdrawal_requests SET status=$1, admin_note=$2, processed_at=NOW() WHERE id=$3`,
    [status, admin_note, req.params.id]
  );

  if (status === 'approved') {
    // Deduct from balance
    await db.query(
      `UPDATE users SET affiliate_balance = affiliate_balance - $1 WHERE id=$2`,
      [wr.rows[0].amount, wr.rows[0].affiliate_id]
    );
    // Approve commissions
    await db.query(
      `UPDATE affiliate_commissions SET status='paid' WHERE affiliate_id=$1 AND status='approved'`,
      [wr.rows[0].affiliate_id]
    );
  }
  res.json({ message: `Withdrawal ${status}` });
});

// Admin: approve commission (move from pending to balance)
router.post('/admin/commissions/:id/approve', authenticate, requireAdmin, async (req, res) => {
  const comm = await db.query('SELECT * FROM affiliate_commissions WHERE id=$1', [req.params.id]);
  if (!comm.rows[0]) return res.status(404).json({ error: 'Not found' });

  await db.query(
    `UPDATE affiliate_commissions SET status='approved' WHERE id=$1`,
    [req.params.id]
  );
  await db.query(
    `UPDATE users SET affiliate_balance = affiliate_balance + $1, affiliate_pending = affiliate_pending - $1 WHERE id=$2`,
    [comm.rows[0].amount, comm.rows[0].affiliate_id]
  );
  res.json({ message: 'Commission approved' });
});

module.exports = router;
