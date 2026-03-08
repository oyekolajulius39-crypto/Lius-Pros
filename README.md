# Lius Pros — Digital Subscription Marketplace

A full-stack subscription marketplace with Paystack payments, slot management, affiliate system, and admin panel.

---

## Tech Stack

- **Frontend**: Next.js + Tailwind CSS + Lexend font
- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **Auth**: JWT
- **Payments**: Paystack API
- **Jobs**: node-cron (expiry + reminders)

---

## Project Structure

```
liuspros/
├── backend/
│   ├── server.js              # Express app entry point
│   ├── .env.example           # Environment variables template
│   ├── db/
│   │   ├── index.js           # PostgreSQL pool
│   │   └── schema.sql         # Full DB schema
│   ├── middleware/
│   │   └── auth.js            # JWT + role guards
│   ├── routes/
│   │   ├── auth.js            # Register, Login, Me, Change Password
│   │   ├── products.js        # CRUD products (admin)
│   │   ├── slots.js           # Slot management + credential rotation
│   │   ├── subscriptions.js   # User & admin subscriptions
│   │   ├── payments.js        # Paystack init + verify + slot assignment
│   │   ├── webhooks.js        # Paystack charge.success webhook
│   │   ├── admin.js           # Dashboard, users, revenue, settings
│   │   ├── affiliate.js       # Affiliate apply, dashboard, withdrawals
│   │   └── user.js            # Profile update
│   └── jobs/
│       ├── expire.js          # Midnight cron: expire subs + free slots
│       └── reminders.js       # 9am cron: send renewal reminder emails
└── SubHub-LiusPros.jsx        # Full frontend demo (React artifact)
```

---

## Quick Start

### 1. Database Setup

```bash
createdb liuspros
psql liuspros < backend/db/schema.sql
```

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Fill in your DATABASE_URL, JWT_SECRET, PAYSTACK keys, SMTP credentials
npm install
npm run dev
```

### 3. Frontend (Next.js)

```bash
npx create-next-app@latest frontend --tailwind --app
cd frontend
npm install
# Copy your components and pages
npm run dev
```

---

## Environment Variables

```env
DATABASE_URL=postgresql://user:password@localhost:5432/liuspros
JWT_SECRET=your-secret-key
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...
FRONTEND_URL=https://yourdomain.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
```

---

## API Endpoints

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/auth/register | Register with optional `?ref=CODE` |
| POST | /api/auth/login | Login → JWT |
| GET  | /api/auth/me | Current user |
| PUT  | /api/auth/change-password | Change password |

### Products
| Method | Route | Auth |
|--------|-------|------|
| GET | /api/products | Public |
| GET | /api/products/:id | Public |
| POST | /api/products | Admin |
| PUT | /api/products/:id | Admin |
| DELETE | /api/products/:id | Admin |

### Slots (Admin)
| Method | Route |
|--------|-------|
| GET | /api/slots |
| POST | /api/slots |
| PUT | /api/slots/:id |
| POST | /api/slots/:id/rotate |
| DELETE | /api/slots/:id |

### Subscriptions
| Method | Route | Auth |
|--------|-------|------|
| GET | /api/subscriptions/my | User |
| GET | /api/subscriptions/:id | User |
| GET | /api/subscriptions | Admin |
| POST | /api/subscriptions/:id/expire | Admin |
| GET | /api/subscriptions/admin/revenue | Admin |

### Payments
| Method | Route |
|--------|-------|
| POST | /api/payments/initialize |
| GET | /api/payments/verify/:reference |

### Webhooks
| Method | Route |
|--------|-------|
| POST | /api/webhooks/paystack |

### Admin
| Method | Route |
|--------|-------|
| GET | /api/admin/dashboard |
| GET | /api/admin/users |
| GET | /api/admin/revenue |
| GET | /api/admin/expiring |
| GET/PUT | /api/admin/settings |

### Affiliate
| Method | Route |
|--------|-------|
| POST | /api/affiliate/apply |
| GET | /api/affiliate/dashboard |
| POST | /api/affiliate/withdraw |
| GET | /api/affiliate/admin/list |
| PUT | /api/affiliate/admin/:id/approve |
| GET | /api/affiliate/admin/withdrawals |
| PUT | /api/affiliate/admin/withdrawals/:id |

---

## Paystack Integration

### Payment Flow
1. Frontend calls `POST /api/payments/initialize` with `product_id`
2. Backend creates Paystack transaction → returns `authorization_url`
3. User pays on Paystack hosted page
4. Paystack redirects to `FRONTEND_URL/payment/callback`
5. Frontend calls `GET /api/payments/verify/:reference`
6. Backend verifies → assigns slot → activates subscription

### Webhook (Recommended)
Set webhook URL in Paystack dashboard:
```
https://yourdomain.com/api/webhooks/paystack
```

---

## Credential Access Rules

- `subscription.status = 'active'` → show login email, password, profile name
- `subscription.status = 'expired'` → show "Subscription expired. Renew to regain access."
- Admin can rotate credentials (change login_email/password) on any slot

---

## Cron Jobs

| Job | Schedule | Action |
|-----|----------|--------|
| Expire subscriptions | `0 0 * * *` (midnight) | Marks expired subs, frees slots |
| Renewal reminders | `0 9 * * *` (9am) | Emails users expiring in 3 days |

---

## Affiliate System

- Users apply → admin approves
- Each affiliate gets unique referral code
- Referral link: `https://yourdomain.com/register?ref=CODE`
- Commission = product_price × 20% (configurable in settings)
- Commission is added as `pending` → admin approves → moved to `balance`
- Affiliate requests withdrawal → admin pays + marks as paid
- Self-referrals are prevented

---

## Deployment

### Backend (Railway / Render / DigitalOcean)
```bash
npm start
# Set all .env variables in your platform dashboard
```

### Frontend (Vercel)
```bash
vercel deploy
# Set NEXT_PUBLIC_API_URL and NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
```

### Database (Supabase / Neon / Railway PostgreSQL)
- Run schema.sql on your hosted PostgreSQL instance

---

## Admin Credentials (First Setup)

Insert an admin user manually:
```sql
INSERT INTO users (email, password_hash, full_name, role, referral_code)
VALUES (
  'admin@liuspros.com',
  '$2a$12$...', -- bcrypt hash of your password
  'Admin',
  'admin',
  'ADMIN001'
);
```

Or use the seed script:
```bash
node db/seed.js
```

---

Built with ❤️ for Lius Pros
