#!/bin/sh
# Dump current environment to /etc/environment so cron jobs can access them
printenv | grep -v "^_=" > /etc/environment
exec cron -f
