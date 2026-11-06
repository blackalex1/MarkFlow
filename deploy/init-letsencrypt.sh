#!/bin/bash

# Detect Docker Compose version
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif docker-compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
  echo 'Error: docker-compose or docker compose is not installed.' >&2
  exit 1
fi

echo "=========================================================="
echo "          MarkFlow SSL Setup Wizard (Certbot)             "
echo "=========================================================="
echo ""

# Load variables from .env if it exists
if [ -f ../.env ]; then
  export $(grep -v '^#' ../.env | xargs)
fi

# Ask if the user wants SSL (if not already running from setup.sh)
if [ -z "$DOMAIN_NAME" ]; then
    read -p "Do you want to request an SSL certificate from Let's Encrypt? (y/N): " want_ssl
    if [[ ! "$want_ssl" =~ ^[Yy]$ ]]; then
        echo "Setup skipped."
        exit 0
    fi

    # Ask for domain
    read -p "Enter your domain name (e.g., docs.example.com): " DOMAIN_NAME
    if [ -z "$DOMAIN_NAME" ]; then
        echo "Error: Domain name is required."
        exit 1
    fi

    # Ask for email
    read -p "Enter your email for renewal notifications (optional, press Enter to skip): " CERTBOT_EMAIL

    # Save to .env for persistence
    echo "DOMAIN_NAME=$DOMAIN_NAME" >> ../.env
    echo "CERTBOT_EMAIL=$CERTBOT_EMAIL" >> ../.env
fi

echo ""
echo "----------------------------------------------------------"
echo "Configuring SSL for: $DOMAIN_NAME"
[ -n "$CERTBOT_EMAIL" ] && echo "Notification email: $CERTBOT_EMAIL" || echo "Notification email: None (Unsafe mode enabled)"
echo "----------------------------------------------------------"
echo ""

# Configuration variables
domains=($DOMAIN_NAME)
rsa_key_size=4096
data_path="../certbot"
email="$CERTBOT_EMAIL"
staging=0 # Set to 1 for testing

if [ -d "$data_path" ]; then
  read -p "Existing Certbot data found. Continue and replace existing certificate? (y/N): " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit
  fi
fi

# Prepare folders and TLS params
mkdir -p "$data_path/conf"
mkdir -p "$data_path/www"

# Prepare Nginx configuration
echo "### Preparing Nginx configuration..."
cp ./nginx.conf.template ./nginx.conf
sed -i "s/{{DOMAIN_NAME}}/$DOMAIN_NAME/g" ./nginx.conf
sed -i "s/{{HTTPS_PORT}}/$HTTPS_PORT/g" ./nginx.conf

# Ensure everyone can read/write to challenge folder so Nginx can see it
chmod -R 777 "$data_path/www"

if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ]; then
  echo "### Setting up recommended TLS parameters..."
  cat << 'EOF' > "$data_path/conf/options-ssl-nginx.conf"
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384";
EOF
fi

if [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
  echo "### Generating local 2048-bit Diffie-Hellman parameters (this may take a moment)..."
  if command -v openssl &>/dev/null; then
    openssl dhparam -out "$data_path/conf/ssl-dhparams.pem" 2048
  else
    $DOCKER_COMPOSE --env-file ../.env run --rm --entrypoint "openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048" certbot
  fi
fi

echo "### Creating dummy certificate to bootstrap Nginx..."
path="/etc/letsencrypt/live/$DOMAIN_NAME"
mkdir -p "$data_path/conf/live/$DOMAIN_NAME"
# Use environment variable to pass domain to nginx.conf template if needed
DOMAIN_NAME=$DOMAIN_NAME $DOCKER_COMPOSE --env-file ../.env run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:2048 -days 1\
    -keyout '$path/privkey.pem' \
    -out '$path/fullchain.pem' \
    -subj '/CN=localhost'" certbot

echo "### Starting Nginx (HTTP mode)..."
DOMAIN_NAME=$DOMAIN_NAME $DOCKER_COMPOSE --env-file ../.env up --force-recreate -d nginx

# Wait for Nginx to process templates and start listening
echo "### Waiting for Nginx to initialize..."
sleep 5

echo "### Deleting dummy certificate..."
$DOCKER_COMPOSE --env-file ../.env run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/$DOMAIN_NAME /etc/letsencrypt/archive/$DOMAIN_NAME /etc/letsencrypt/renewal/$DOMAIN_NAME.conf" certbot

echo "### Requesting real certificate from Let's Encrypt..."
# Construct domain args
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

# Handle email
email_arg="--email $email"
if [ -z "$email" ]; then
  email_arg="--register-unsafely-without-email"
fi

# Staging mode
if [ $staging != "0" ]; then staging_arg="--staging"; fi

$DOCKER_COMPOSE --env-file ../.env run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --force-renewal" certbot

echo "### Reloading Nginx with new certificates..."
$DOCKER_COMPOSE --env-file ../.env exec nginx nginx -s reload

echo ""
echo "=========================================================="
echo "   SSL Configuration Complete for $DOMAIN_NAME!   "
echo "=========================================================="
