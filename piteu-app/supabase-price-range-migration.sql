-- Add price_range column to rooms table
ALTER TABLE rooms 
ADD COLUMN IF NOT EXISTS price_range TEXT;
