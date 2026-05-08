#!/bin/bash

# Navigate to deploy directory if not already there
cd "$(dirname "$0")"

echo "=========================================================="
echo "          MarkFlow: Quick Rebuild & Update                "
echo "=========================================================="

# 1. Pull latest changes
echo "### Pulling latest changes from Git..."
git pull

# 2. Rebuild and restart only the app container
echo "### Rebuilding and restarting application..."
# Regenerate nginx.conf from template before building
if [ -f "../.env" ]; then
    export $(grep -v '^#' ../.env | xargs)
    # Strip \r (CRLF) to prevent Nginx config breakage
    DOMAIN_NAME=$(echo $DOMAIN_NAME | tr -d '\r')
    HTTPS_PORT=$(echo $HTTPS_PORT | tr -d '\r')
    
    if [ -f "./nginx.conf.template" ]; then
        echo "### Regenerating Nginx config from template..."
        cp ./nginx.conf.template ./nginx.conf
        sed -i "s/{{DOMAIN_NAME}}/${DOMAIN_NAME}/g" ./nginx.conf
        sed -i "s/{{HTTPS_PORT}}/${HTTPS_PORT:-443}/g" ./nginx.conf
    fi
fi

docker compose --env-file ../.env up -d --build

# 3. Reload Nginx just in case
echo "### Reloading Nginx configuration..."
docker compose --env-file ../.env exec -T nginx nginx -s reload

echo ""
echo "=========================================================="
echo "          Update Complete! Application is restarting.      "
echo "=========================================================="
echo " Check logs with: docker logs markflow"
