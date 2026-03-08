const router = require('express').Router();
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// Dashboard summary
router.get('/dashboard', async (req, res) => {
  const [revenue, subs, users, slots] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='success'`),
    db.query(`SELECT 
      COUNT(*) FILTER (WHERE status='active') as active,
      COUNT(*) FILTER (WHERE status='expired') as expired,
      COUNT(*) FILTER (WHERE expiry_date BETWEEN NOW() AND NOW() + INTERVAL '3 days' AND status='active') as expiring_soon
      FROM subscriptions`),
    db.query(`SELECT COUNT(*) as total FROM users WHERE role != 'admin'`),
    db.query(`SELECT 
      COUNT(*) FILTER (WHERE status='available') as available,
      COUNT(*) FILTER (WHERE status='used') as used
      FROM slots`)
  ]);
  res.json({
    revenue: revenue.rows[0],
    subscriptions: subs.rows[0],
    users: users.rows[0],
    slots: slots.rows[0]
  });
});

// Users management
router.get('/users', async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let query = `SELECT u.id, u.email, u.full_name, u.whatsapp, u.role, u.is_affiliate, 
               u.affiliate_status, u.created_at,
               COUNT(s.id) FILTER (WHERE s.status='active') as active_subs
               FROM users u
               LEFT JOIN subscriptions s ON s.user_id = u.id`;
  const params = [];
  if (search) {
    query += ` WHERE (u.email ILIKE $1 OR u.full_name ILIKE $1)`;
    params.push(`%${search}%`);
  }
  query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
  params.push(limit, offset);
  const { rows } = await db.query(query, params);
  res.json(rows);
});

// Revenue details
router.get('/revenue', async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.id, p.created_at, p.amount, u.email, u.full_name, 
     pr.name as product_name, p.status, p.paystack_reference
     FROM payments p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN subscriptions sub ON sub.id = p.subscription_id
     LEFT JOIN products pr ON pr.id = sub.product_id
     ORDER BY p.created_at DESC LIMIT 100`
  );
  res.json(rows);
});

// Monthly revenue chart
router.get('/revenue/monthly', async (req, res) => {
  const { rows } = await db.query(
    `SELECT DATE_TRUNC('month', created_at) as month,
     SUM(amount) as revenue, COUNT(*) as transactions
     FROM payments WHERE status='success'
     GROUP BY 1 ORDER BY 1 DESC LIMIT 12`
  );
  res.json(rows);
});

// Expiring subscriptions
router.get('/expiring', async (req, res) => {
  const { rows } = await db.query(
    `SELECT sub.*, u.email, u.full_name, u.whatsapp, p.name as product_name
     FROM subscriptions sub
     JOIN users u ON u.id = sub.user_id
     JOIN products p ON p.id = sub.product_id
     WHERE sub.status='active' AND sub.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
     ORDER BY sub.expiry_date ASC`
  );
  res.json(rows);
});

// Settings
router.get('/settings', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM settings');
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

router.put('/settings', async (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    await db.query(
      `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [key, value]
    );
  }
  res.json({ message: 'Settings updated' });
});

module.exports = router;
