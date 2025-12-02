-- Add is_generating_suggestions column to rooms table
ALTER TABLE rooms 
ADD COLUMN IF NOT EXISTS is_generating_suggestions BOOLEAN DEFAULT FALSE;
