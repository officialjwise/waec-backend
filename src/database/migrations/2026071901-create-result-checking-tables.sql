-- Migration to support result checking feature
-- Date: 2026-07-19

-- Drop foreign key constraint on checkers.order_id to allow referencing either orders or result_check_orders
ALTER TABLE checkers DROP CONSTRAINT IF EXISTS checkers_order_id_fkey;

-- Create result_check_orders table
CREATE TABLE IF NOT EXISTS result_check_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  result_type VARCHAR(20) NOT NULL CHECK (result_type IN ('BECE', 'WASSCE', 'WASSCE-NOVDEC')),
  index_number VARCHAR(10) NOT NULL,
  year INTEGER NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(100) NOT NULL,
  momo_number VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 25.00,
  paystack_ref VARCHAR(100),
  assigned_checker_id UUID,
  checker_serial VARCHAR(50),
  checker_pin VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create result_release_years table
CREATE TABLE IF NOT EXISTS result_release_years (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  result_type VARCHAR(20) NOT NULL CHECK (result_type IN ('BECE', 'WASSCE', 'WASSCE-NOVDEC')),
  year INTEGER NOT NULL,
  is_released BOOLEAN DEFAULT FALSE,
  released_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraint to release years to prevent duplicates
ALTER TABLE result_release_years DROP CONSTRAINT IF EXISTS result_release_years_type_year_key;
ALTER TABLE result_release_years ADD CONSTRAINT result_release_years_type_year_key UNIQUE (result_type, year);

-- Enable RLS
ALTER TABLE result_check_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_release_years ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY result_check_orders_admin ON result_check_orders FOR ALL TO authenticated USING (true);
CREATE POLICY result_release_years_admin ON result_release_years FOR ALL TO authenticated USING (true);
