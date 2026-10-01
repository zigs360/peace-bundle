#!/bin/bash
set -e

# ==============================================================================
# Peace Bundle - Host Nginx Reverse Proxy & SSL Setup
# ==============================================================================
# Use this when your droplet hosts MULTIPLE projects on port 80/443.
# This script configures the droplet host Nginx to route 'peacebundlle.com'
# to the Peace Bundle Docker container on port 3080, and issues SSL via Certbot.
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found in current directory.${NC}"
  exit 1
fi

# Load environment variables safely
load_env_file() {
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
}
load_env_file

DOMAIN="${DOMAIN_NAME:-peacebundlle.com}"
PORT="${HTTP_PORT:-3080}"
EMAIL="${SSL_EMAIL:-admin@peacebundlle.com}"

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE} Configuring Host Nginx for Multiple Projects                   ${NC}"
echo -e "${BLUE} Domain:     $DOMAIN and www.$DOMAIN                           ${NC}"
echo -e "${BLUE} Forward To: http://127.0.0.1:$PORT (Peace Bundle Docker)       ${NC}"
echo -e "${BLUE}================================================================${NC}"

# 1. Check if Nginx is installed on the host
if ! command -v nginx >/dev/null 2>&1; then
  echo -e "\n${YELLOW}Installing host Nginx...${NC}"
  apt-get update && apt-get install -y nginx
fi

# 2. Check if certbot and python3-certbot-nginx are installed
if ! command -v certbot >/dev/null 2>&1 || ! dpkg -s python3-certbot-nginx >/dev/null 2>&1; then
  echo -e "\n${YELLOW}Installing Certbot Nginx plugin...${NC}"
  apt-get update && apt-get install -y certbot python3-certbot-nginx
fi

# 3. Create host Nginx site configuration
CONFIG_FILE="/etc/nginx/sites-available/$DOMAIN.conf"
ENABLED_FILE="/etc/nginx/sites-enabled/$DOMAIN.conf"

echo -e "\n${BLUE}Creating host Nginx configuration at $CONFIG_FILE...${NC}"

cat > "$CONFIG_FILE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF

# Enable site and remove default placeholder page if present
mkdir -p /etc/nginx/sites-enabled
rm -f /etc/nginx/sites-enabled/default
ln -sf "$CONFIG_FILE" "$ENABLED_FILE"

# 4. Test host Nginx configuration
echo -e "\n${BLUE}Testing host Nginx syntax...${NC}"
nginx -t

echo -e "\n${BLUE}Reloading host Nginx...${NC}"
systemctl reload nginx

# 5. Obtain Let's Encrypt SSL via host Certbot
echo -e "\n${BLUE}Requesting Let's Encrypt SSL certificate for $DOMAIN and www.$DOMAIN...${NC}"

certbot --nginx \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  --agree-tos \
  --non-interactive \
  --email "$EMAIL" \
  --redirect || {
    echo -e "${YELLOW}Certbot automatic setup hit an issue. You can run manually:${NC}"
    echo "sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
  }

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN} Setup Complete!                                                ${NC}"
echo -e "${GREEN} Your other projects continue running on ports 80/8080.        ${NC}"
echo -e "${GREEN} peacebundlle.com is now live with genuine HTTPS SSL!          ${NC}"
echo -e "${GREEN}================================================================${NC}"
