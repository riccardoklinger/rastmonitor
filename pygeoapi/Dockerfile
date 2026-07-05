FROM geopython/pygeoapi:latest

# gettext-base provides envsubst
RUN apt-get update && apt-get install -y --no-install-recommends gettext-base \
    && rm -rf /var/lib/apt/lists/*

COPY config.yml.template /pygeoapi/config.yml.template
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Override ENTRYPOINT: envsubst first, then call the original /entrypoint.sh
ENTRYPOINT ["/start.sh"]
