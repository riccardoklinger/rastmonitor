BEGIN;
ALTER TABLE filter_link_views DROP CONSTRAINT IF EXISTS filter_link_views_parameter_name_check;
ALTER TABLE filter_link_views ADD CONSTRAINT filter_link_views_parameter_name_check
  CHECK (parameter_name IN ('operator', 'road', 'state'));
COMMIT;
