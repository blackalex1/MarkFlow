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
    echo "### Loading and sanitizing environment variables..."
    # Robust way to load .env stripping \r and potential quotes
    while IFS='=' read -r key value || [ -n "$key" ]; do
        # Skip comments and empty lines
        [[ $key =~ ^#.* ]] && continue
        [[ -z $key ]] && continue
        
        # Clean value: remove \r, trailing/leading spaces, and quotes
        clean_value=$(echo "$value" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')
        export "$key"="$clean_value"
    done < "../.env"
    
    # Detect whether SSL certificates exist for the configured domain
    SSL_CERT="../certbot/conf/live/${DOMAIN_NAME}/fullchain.pem"
    SSL_KEY="../certbot/conf/live/${DOMAIN_NAME}/privkey.pem"
    SSL_PARAMS="../certbot/conf/options-ssl-nginx.conf"

    if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ] && [ -f "$SSL_PARAMS" ] && [ -f "./nginx.conf.template" ]; then
        echo "### SSL certificates found. Regenerating Nginx config from HTTPS template..."
        cp ./nginx.conf.template ./nginx.conf
        sed -i "s/{{DOMAIN_NAME}}/${DOMAIN_NAME}/g" ./nginx.conf
        sed -i "s/{{HTTPS_PORT}}/${HTTPS_PORT:-443}/g" ./nginx.conf
    elif [ -f "./nginx-http.conf.template" ]; then
        echo "### SSL not configured. Regenerating Nginx config from HTTP template..."
        cp ./nginx-http.conf.template ./nginx.conf
    fi
fi

docker compose --env-file ../.env up -d --build
# Explicitly restart services to pick up volume and code changes
docker compose --env-file ../.env restart markflow nginx

# 3. Reload Nginx just in case
echo "### Reloading Nginx configuration..."
docker compose --env-file ../.env exec -T nginx nginx -s reload

echo ""
echo "=========================================================="
echo "          Update Complete! Application is restarting.      "
echo "=========================================================="
echo " Check logs with: docker logs markflow"
