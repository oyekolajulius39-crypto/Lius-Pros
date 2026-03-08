-- Lius Pros Database Schema
-- PostgreSQL

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(50),
  full_name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'affiliate')),
  affiliate_id UUID,
  referral_code VARCHAR(20) UNIQUE,
  is_affiliate BOOLEAN DEFAULT FALSE,
  affiliate_status VARCHAR(20) DEFAULT 'none' CHECK (affiliate_status IN ('none', 'pending', 'approved', 'rejected')),
  affiliate_balance DECIMAL(10,2) DEFAULT 0.00,
  affiliate_pending DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Products Table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  category VARCHAR(100),
  image_url VARCHAR(500),
  features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  commission_rate DECIMAL(5,2) DEFAULT 20.00,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Slots Table
CREATE TABLE slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  login_email VARCHAR(255) NOT NULL,
  login_password VARCHAR(255) NOT NULL,
  profile_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'used')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions Table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  slot_id UUID REFERENCES slots(id),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  payment_reference VARCHAR(255),
  amount_paid DECIMAL(10,2),
  affiliate_id UUID REFERENCES users(id),
  commission_paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Payments Table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  subscription_id UUID REFERENCES subscriptions(id),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'NGN',
  paystack_reference VARCHAR(255) UNIQUE NOT NULL,
  paystack_transaction_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Affiliate Commissions Table
CREATE TABLE affiliate_commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id UUID NOT NULL REFERENCES users(id),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  referred_user_id UUID NOT NULL REFERENCES users(id),
  product_id UUID NOT NULL REFERENCES products(id),
  amount DECIMAL(10,2) NOT NULL,
  rate DECIMAL(5,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Withdrawal Requests Table
CREATE TABLE withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id UUID NOT NULL REFERENCES users(id),
  amount DECIMAL(10,2) NOT NULL,
  bank_name VARCHAR(255),
  account_number VARCHAR(50),
  account_name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  admin_note TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Admin Settings Table
CREATE TABLE settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Email Reminders Log
CREATE TABLE reminder_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  email VARCHAR(255) NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW(),
  type VARCHAR(50) DEFAULT 'renewal_reminder'
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('commission_rate', '20'),
  ('site_name', 'Lius Pros'),
  ('paystack_public_key', ''),
  ('renewal_reminder_days', '3');

-- Indexes for performance
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_expiry ON subscriptions(expiry_date);
CREATE INDEX idx_slots_product_status ON slots(product_id, status);
CREATE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_users_affiliate_id ON users(affiliate_id);
