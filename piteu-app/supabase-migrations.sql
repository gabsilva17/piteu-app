-- Piteu App Database Migrations
-- Execute these SQL statements in your Supabase SQL Editor

-- Add restrictions column to participants table
-- This stores dietary restrictions as an array of text values
ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS restrictions TEXT[] DEFAULT '{}';

-- Add admin_user_id to rooms table
-- This references the participant who is the admin (first to join)
ALTER TABLE rooms 
ADD COLUMN IF NOT EXISTS admin_user_id TEXT;

-- Add location to rooms table
-- This stores the selected eating location (nullable, set by admin)
ALTER TABLE rooms 
ADD COLUMN IF NOT EXISTS location TEXT;

-- Add foreign key constraint for data integrity
-- This ensures admin_user_id references a valid participant
-- ON DELETE SET NULL means if the admin leaves, the field is set to NULL
ALTER TABLE rooms 
ADD CONSTRAINT fk_admin_user 
FOREIGN KEY (admin_user_id) 
REFERENCES participants(id) 
ON DELETE SET NULL;

-- Note: If you get an error about the constraint already existing,
-- you can safely ignore it or drop it first with:
-- ALTER TABLE rooms DROP CONSTRAINT IF EXISTS fk_admin_user;
