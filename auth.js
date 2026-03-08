const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

// Generate referral code
const generateReferralCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, whatsapp, ref } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    // Check existing user
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) return res.status(400).json({ error: 'Email already registered' });

    // Find affiliate (referrer)
    let affiliateId = null;
    if (ref) {
      const refUser = await db.query(
        'SELECT id FROM users WHERE referral_code = $1 AND is_affiliate = TRUE AND affiliate_status = $2',
        [ref, 'approved']
      );
      if (refUser.rows[0]) affiliateId = refUser.rows[0].id;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const referral_code = generateReferralCode();

    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, full_name, whatsapp, affiliate_id, referral_code)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, full_name, role`,
      [email.toLowerCase(), password_hash, full_name, whatsapp, affiliateId, referral_code]
    );

    const token = jwt.sign({ userId: rows[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email?.toLowerCase()]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, email, full_name, whatsapp, role, is_affiliate, affiliate_status, referral_code, affiliate_balance, affiliate_pending, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json(rows[0]);
});

// Change password
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(current_password, rows[0].password_hash))) {
      return res.status(400).json({ error: 'Current password incorrect' });
    }
    const hash = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
