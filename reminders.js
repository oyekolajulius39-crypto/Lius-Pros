const db = require('../db');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendRenewalReminders() {
  const { rows } = await db.query(
    `SELECT sub.id, sub.expiry_date, u.email, u.full_name, p.name as product_name
     FROM subscriptions sub
     JOIN users u ON u.id = sub.user_id
     JOIN products p ON p.id = sub.product_id
     WHERE sub.status='active' 
       AND sub.expiry_date = CURRENT_DATE + INTERVAL '3 days'
       AND NOT EXISTS (
         SELECT 1 FROM reminder_logs rl WHERE rl.subscription_id = sub.id AND rl.type='renewal_reminder'
         AND DATE(rl.sent_at) = CURRENT_DATE
       )`
  );

  for (const row of rows) {
    try {
      await transporter.sendMail({
        from: `"Lius Pros" <${process.env.SMTP_USER}>`,
        to: row.email,
        subject: `⚠️ Your ${row.product_name} subscription expires in 3 days`,
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:auto">
            <h2 style="color:#7c3aed">Lius Pros</h2>
            <p>Hi ${row.full_name || row.email},</p>
            <p>Your <strong>${row.product_name}</strong> subscription is expiring on 
               <strong>${new Date(row.expiry_date).toDateString()}</strong>.</p>
            <p>Renew now to keep your access uninterrupted.</p>
            <a href="${process.env.FRONTEND_URL}/dashboard" 
               style="background:#7c3aed;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">
              Renew Subscription
            </a>
            <p style="margin-top:20px;color:#666;font-size:12px">
              Lius Pros — Your Digital Subscription Marketplace
            </p>
          </div>
        `
      });

      await db.query(
        `INSERT INTO reminder_logs (subscription_id, email) VALUES ($1,$2)`,
        [row.id, row.email]
      );

      console.log(`[REMINDER] Sent to ${row.email} for ${row.product_name}`);
    } catch (err) {
      console.error(`[REMINDER] Failed for ${row.email}:`, err.message);
    }
  }
}

module.exports = { sendRenewalReminders };
