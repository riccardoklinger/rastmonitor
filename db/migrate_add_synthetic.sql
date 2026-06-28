-- Migration: add is_synthetic flag to raw and daily tables
-- Run once on existing databases. Safe to re-run (uses IF NOT EXISTS / DO blocks).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parking_status' AND column_name = 'is_synthetic'
  ) THEN
    ALTER TABLE parking_status ADD COLUMN is_synthetic BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parking_status_daily' AND column_name = 'is_synthetic'
  ) THEN
    ALTER TABLE parking_status_daily ADD COLUMN is_synthetic BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
