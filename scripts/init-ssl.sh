#!/bin/bash
set -e

# ==============================================================================
# Peace Bundle - Let's Encrypt SSL Bootstrap Script (Frontend + Backend Stack)
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found. Please create .env from .env.example first.${NC}"
  exit 1
fi

# Load environment variables safely
load_env_file() {
  if [ -f .env ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      clean_line=$(echo "$line" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
      [[ "$clean_line" =~ ^#.* ]] && continue
      [ -z "$clean_line" ] && continue
      if [[ "$clean_line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
        key="${clean_line%%=*}"
        val="${clean_line#*=}"
        val=$(echo "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
        export "$key=$val"
      fi
    done < .env
  fi
}
load_env_file

PRIMARY_DOMAIN="${DOMAIN_NAME:-peacebundlle.com}"

if [ -z "$PRIMARY_DOMAIN" ] || [ -z "$SSL_EMAIL" ]; then
  echo -e "${RED}Error: DOMAIN_NAME and SSL_EMAIL must be set in your .env file.${NC}"
  exit 1
fi

echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}  Initializing SSL for Peace Bundle Platform               ${NC}"
echo -e "${BLUE}  Primary Domain: $PRIMARY_DOMAIN                         ${NC}"
echo -e "${BLUE}  Contact Email:  $SSL_EMAIL                              ${NC}"
echo -e "${BLUE}==========================================================${NC}"

# Check if certificate already exists
if docker run --rm -v peacebundle_certbot_conf:/etc/letsencrypt alpine test -d "/etc/letsencrypt/live/$PRIMARY_DOMAIN"; then
  echo -e "${GREEN}Certificate already exists for $PRIMARY_DOMAIN. Testing renewal...${NC}"
  docker compose run --rm certbot renew
  docker compose exec nginx nginx -s reload || true
  exit 0
fi

# Build list of candidate domains
CANDIDATE_DOMAINS=("$PRIMARY_DOMAIN")

# Add www subdomain if not already www
if [[ "$PRIMARY_DOMAIN" != www.* ]]; then
  CANDIDATE_DOMAINS+=("www.$PRIMARY_DOMAIN")
fi

# Add API subdomain if configured and distinct
if [ -n "$API_DOMAIN" ] && [ "$API_DOMAIN" != "$PRIMARY_DOMAIN" ]; then
  CANDIDATE_DOMAINS+=("$API_DOMAIN")
fi

# Check DNS resolution for each domain to avoid Certbot challenge failures
CERT_DOMAINS=()
CERTBOT_D_FLAGS=""

echo -e "\n${BLUE}Verifying DNS resolution for candidate domains...${NC}"
for d in "${CANDIDATE_DOMAINS[@]}"; do
  # Check if domain resolves to an IP address
  if getent ahostsv4 "$d" >/dev/null 2>&1 || ping -c 1 -W 2 "$d" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ DNS verified:${NC} $d"
    CERT_DOMAINS+=("$d")
    CERTBOT_D_FLAGS="$CERTBOT_D_FLAGS -d $d"
  else
    echo -e "${YELLOW}⚠ Warning: $d does not resolve in DNS yet. Skipping from certificate to prevent Let's Encrypt errors.${NC}"
  fi
done

if [ ${#CERT_DOMAINS[@]} -eq 0 ]; then
  echo -e "${RED}Error: None of the candidate domains resolve in DNS.${NC}"
  echo "Please verify that your domain A-records point to this Droplet's IP address."
  exit 1
fi

echo -e "\n${BLUE}Selected domains for certificate: ${CERT_DOMAINS[*]}${NC}"

# Step 1: Create dummy certificate for Nginx startup
echo -e "\n${BLUE}Step 1: Creating temporary self-signed certificate for Nginx startup...${NC}"
docker compose run --rm --entrypoint "\
  sh -c '\
    mkdir -p /etc/letsencrypt/live/$PRIMARY_DOMAIN && \
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/$PRIMARY_DOMAIN/privkey.pem \
      -out /etc/letsencrypt/live/$PRIMARY_DOMAIN/fullchain.pem \
      -subj \"/CN=localhost\"'" certbot

# Step 2: Start Nginx
echo -e "\n${BLUE}Step 2: Starting Nginx web server...${NC}"
docker compose up -d nginx

# Step 3: Remove dummy certificate
echo -e "\n${BLUE}Step 3: Requesting genuine Let's Encrypt certificates...${NC}"
docker compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$PRIMARY_DOMAIN && \
  rm -Rf /etc/letsencrypt/archive/$PRIMARY_DOMAIN && \
  rm -Rf /etc/letsencrypt/renewal/$PRIMARY_DOMAIN.conf" certbot

# Request genuine certificate using webroot
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --email $SSL_EMAIL \
    $CERTBOT_D_FLAGS \
    --rsa-key-size 4096 \
    --agree-tos \
    --non-interactive \
    --no-eff-email" certbot

# Step 4: Reload Nginx
echo -e "\n${BLUE}Step 4: Reloading Nginx with new certificates...${NC}"
docker compose exec nginx nginx -s reload

echo -e "\n${GREEN}==========================================================${NC}"
echo -e "${GREEN} SSL Certificates successfully generated!                ${NC}"
echo -e "${GREEN} Both HTTP (80) and HTTPS (443) are operational.         ${NC}"
echo -e "${GREEN}==========================================================${NC}"
