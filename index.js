require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use('/api/', limiter);

// Body parsing - raw for webhook, json for everything else
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/affiliate', require('./routes/affiliate'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/user', require('./routes/user'));
app.use('/api/slots', require('./routes/slots'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'Lius Pros API' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// ─── CRON JOBS ───────────────────────────────────────────────
const { expireSubscriptions } = require('./jobs/expire');
const { sendRenewalReminders } = require('./jobs/reminders');

// Every midnight: expire subscriptions + free slots
cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running subscription expiry job...');
  await expireSubscriptions();
});

// Every day at 9am: send renewal reminders (3 days before expiry)
cron.schedule('0 9 * * *', async () => {
  console.log('[CRON] Running renewal reminder job...');
  await sendRenewalReminders();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Lius Pros API running on port ${PORT}`);
});

module.exports = app;
