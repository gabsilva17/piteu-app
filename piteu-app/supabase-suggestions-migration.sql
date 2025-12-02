-- Add suggestions column to rooms table
-- This stores restaurant suggestions as a JSONB array
ALTER TABLE rooms 
ADD COLUMN IF NOT EXISTS suggestions JSONB DEFAULT '[]'::jsonb;
