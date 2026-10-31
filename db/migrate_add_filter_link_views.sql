CREATE TABLE IF NOT EXISTS filter_link_views (
    day             DATE NOT NULL DEFAULT CURRENT_DATE,
    parameter_name  TEXT NOT NULL CHECK (parameter_name IN ('operator', 'road')),
    parameter_value TEXT NOT NULL CHECK (length(parameter_value) BETWEEN 1 AND 200),
    count           BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (day, parameter_name, parameter_value)
);
