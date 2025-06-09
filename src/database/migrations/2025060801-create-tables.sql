CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- checkers table
CREATE TABLE checkers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  serial VARCHAR(50) UNIQUE NOT NULL,
  pin VARCHAR(50) UNIQUE NOT NULL,
  waec_type VARCHAR(20) NOT NULL CHECK (waec_type IN ('BECE', 'WASSCE', 'NOVDEC')),
  order_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  waec_type VARCHAR(20) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  paystack_ref VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- otp_requests table
CREATE TABLE otp_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  order_id UUID NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- admins table
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- admin_logs table
CREATE TABLE admin_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id)
);

-- Enable RLS
ALTER TABLE checkers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY checkers_admin ON checkers FOR ALL TO authenticated USING (true);
CREATE POLICY orders_admin ON orders FOR ALL TO authenticated USING (true);
CREATE POLICY orders_user ON orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY otp_admin ON otp_requests FOR ALL TO authenticated USING (true);
CREATE POLICY admins_policy ON admins FOR ALL TO authenticated USING (true);
CREATE POLICY admin_logs_policy ON admin_logs FOR ALL TO authenticated USING (true);