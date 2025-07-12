-- Migration to add support for CSSPS and CTVET checker types
-- Date: 2025-07-12

-- Update the checkers table to allow CSSPS and CTVET
ALTER TABLE checkers 
DROP CONSTRAINT IF EXISTS checkers_waec_type_check;

ALTER TABLE checkers 
ADD CONSTRAINT checkers_waec_type_check 
CHECK (waec_type IN ('BECE', 'WASSCE', 'NOVDEC', 'CSSPS', 'CTVET'));

-- Note: The orders table already uses VARCHAR without specific constraints,
-- so it should already support the new types. But let's add a comment for clarity.

-- Orders table already supports any VARCHAR(20) values for waec_type
-- This includes CSSPS and CTVET automatically
