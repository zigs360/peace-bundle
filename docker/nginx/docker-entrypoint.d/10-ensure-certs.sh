#!/bin/sh
set -e

# ==============================================================================
# Auto-generate temporary self-signed SSL cert if Let's Encrypt cert does not exist yet.
# This guarantees Nginx always starts cleanly without restarting or crashing.
# ==============================================================================

DOMAIN="${DOMAIN_NAME:-peacebundlle.com}"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
  echo "[nginx-init] SSL certificates not found for $DOMAIN. Creating temporary certificate for boot..."
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=$DOMAIN" >/dev/null 2>&1
  echo "[nginx-init] Temporary certificate created for $DOMAIN. Run ./scripts/init-ssl.sh to obtain genuine Let's Encrypt SSL."
fi
