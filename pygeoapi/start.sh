#!/bin/bash
set -e

export PYGEOAPI_HOME=/pygeoapi
export PYGEOAPI_CONFIG=${PYGEOAPI_CONFIG:-/pygeoapi/local.config.yml}
export PYGEOAPI_OPENAPI=${PYGEOAPI_OPENAPI:-/pygeoapi/local.openapi.yml}

# Substitute environment variables into the config template
envsubst < /pygeoapi/config.yml.template > "$PYGEOAPI_CONFIG"

# Generate OpenAPI spec
echo "Generating OpenAPI spec..."
/venv/bin/pygeoapi openapi generate "$PYGEOAPI_CONFIG" \
  --output-file "$PYGEOAPI_OPENAPI" \
  --no-fail-on-invalid-collection

echo "Starting pygeoapi..."
exec /venv/bin/gunicorn \
  --workers 4 \
  --worker-class gevent \
  --timeout 6000 \
  --bind 0.0.0.0:80 \
  pygeoapi.flask_app:APP
