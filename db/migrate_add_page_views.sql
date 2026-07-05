-- Migration: daily page view counter
CREATE TABLE IF NOT EXISTS page_views (
    day    DATE PRIMARY KEY DEFAULT CURRENT_DATE,
    count  BIGINT NOT NULL DEFAULT 0
);
