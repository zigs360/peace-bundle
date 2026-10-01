#!/bin/bash
set -e

# ==============================================================================
# Peace Bundle - DigitalOcean Droplet Automated Setup Script
# Supported OS: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS
# ==============================================================================

echo "=========================================================="
echo " Starting DigitalOcean Droplet Setup for Peace Bundle"
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run this script as root (sudo ./scripts/setup-droplet.sh)"
  exit 1
fi

# 1. Configure 2GB Swap Space (Guards against OOM errors)
echo "[1/5] Checking swap configuration..."
if [ $(swapon --show | wc -l) -le 1 ]; then
  echo "Creating 2GB swapfile..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap configured successfully."
else
  echo "Swap is already active."
fi

# 2. Update system packages
echo "[2/5] Updating apt packages and installing utilities..."
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release ufw git

# 3. Install Docker and Docker Compose plugin
echo "[3/5] Installing Docker Engine..."
if ! command -v docker &> /dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "Docker installed successfully."
else
  echo "Docker is already installed."
fi

# 4. Configure UFW Firewall
echo "[4/5] Configuring firewall rules (UFW)..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3080/tcp
ufw allow 3443/tcp
ufw --force enable
echo "Firewall active (SSH, 80, 443, 3080, 3443 enabled)."

# 5. Summary and Next Steps
echo "=========================================================="
echo " Droplet setup complete!"
echo " Next steps:"
echo " 1. Copy your environment file: cp .env.example .env"
echo " 2. Fill in production secrets: nano .env"
echo " 3. Verify DNS A Record points to this server's IP"
echo " 4. Run SSL initialization: ./scripts/init-ssl.sh"
echo " 5. Start all containers: docker compose up -d"
echo "=========================================================="
