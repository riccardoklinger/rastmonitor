-- Migration: add extended static attributes to parking_sites
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks)

ALTER TABLE parking_sites
  ADD COLUMN IF NOT EXISTS operator_name          TEXT,
  ADD COLUMN IF NOT EXISTS road_identifier        TEXT,
  ADD COLUMN IF NOT EXISTS road_destination       TEXT,
  ADD COLUMN IF NOT EXISTS free_of_charge         BOOLEAN,
  ADD COLUMN IF NOT EXISTS usage_scenario         TEXT,
  ADD COLUMN IF NOT EXISTS location_type          TEXT,
  ADD COLUMN IF NOT EXISTS certified_secure       BOOLEAN,
  ADD COLUMN IF NOT EXISTS occupancy_detection_type TEXT;
