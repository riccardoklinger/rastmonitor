CREATE SCHEMA IF NOT EXISTS routing;

CREATE TABLE IF NOT EXISTS routing.isochrone_usage_daily (
    day date PRIMARY KEY,
    requests bigint NOT NULL DEFAULT 0 CHECK (requests >= 0),
    successes bigint NOT NULL DEFAULT 0 CHECK (successes >= 0 AND successes <= requests)
);