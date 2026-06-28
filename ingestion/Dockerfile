FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    cron \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Install crontab:
# - static fetch once daily at 03:00
# - dynamic fetch every 15 minutes
RUN echo "0 3 * * * python /app/fetch_static.py >> /var/log/cron.log 2>&1\n\
*/15 * * * * python /app/fetch_dynamic.py >> /var/log/cron.log 2>&1\n\
0 2 * * * python /app/aggregate_daily.py >> /var/log/cron.log 2>&1\n\
30 2 * * * python /app/prune_raw.py >> /var/log/cron.log 2>&1" \
    | crontab -

CMD ["cron", "-f"]
