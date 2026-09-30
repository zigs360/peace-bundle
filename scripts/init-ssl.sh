#!/bin/bash
set -e

# ==============================================================================
# Peace Bundle - Let's Encrypt SSL Bootstrap Script for Backend API Droplet
# ==============================================================================

if [ ! -f .env ]; then
  echo "Error: .env file not found. Please create .env from .env.example first."
  exit 1
fi

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Target the API domain (e.g. api.peacebundlle.com)
TARGET_DOMAIN="${API_DOMAIN:-$DOMAIN_NAME}"

if [ -z "$TARGET_DOMAIN" ] || [ -z "$SSL_EMAIL" ]; then
  echo "Error: API_DOMAIN (or DOMAIN_NAME) and SSL_EMAIL must be set in your .env file."
  exit 1
fi

echo "=========================================================="
echo " Initializing SSL for API domain: $TARGET_DOMAIN"
echo " Contact Email: $SSL_EMAIL"
echo "=========================================================="

# Check if certificates already exist
if docker run --rm -v peacebundle_certbot_conf:/etc/letsencrypt alpine test -d "/etc/letsencrypt/live/$TARGET_DOMAIN"; then
  echo "Certificate already exists for $TARGET_DOMAIN. Checking renewal..."
  docker compose run --rm certbot renew
  docker compose exec nginx nginx -s reload || true
  exit 0
fi

echo "Step 1: Creating temporary self-signed certificate for Nginx startup..."
docker compose run --rm --entrypoint "\
  sh -c '\
    mkdir -p /etc/letsencrypt/live/$TARGET_DOMAIN && \
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/$TARGET_DOMAIN/privkey.pem \
      -out /etc/letsencrypt/live/$TARGET_DOMAIN/fullchain.pem \
      -subj \"/CN=localhost\"'" certbot

echo "Step 2: Starting Nginx..."
docker compose up -d nginx

echo "Step 3: Requesting genuine Let's Encrypt certificates..."
# Delete dummy cert
docker compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$TARGET_DOMAIN && \
  rm -Rf /etc/letsencrypt/archive/$TARGET_DOMAIN && \
  rm -Rf /etc/letsencrypt/renewal/$TARGET_DOMAIN.conf" certbot

# Request real cert with Certbot webroot mode
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --email $SSL_EMAIL \
    -d $TARGET_DOMAIN \
    --rsa-key-size 4096 \
    --agree-tos \
    --non-interactive \
    --no-eff-email" certbot

echo "Step 4: Reloading Nginx with new certificates..."
docker compose exec nginx nginx -s reload

echo "=========================================================="
echo " SSL Certificate issued successfully for $TARGET_DOMAIN!"
echo " Both HTTP (port 80) and HTTPS (port 443) are now operational."
echo "=========================================================="
