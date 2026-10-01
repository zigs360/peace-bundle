# Complete Platform Deployment Guide: DigitalOcean (Frontend, Backend & Database)

This guide walks you through hosting the entire **Peace Bundle** platform (Frontend SPA, Node.js API, WebSockets, PostgreSQL Database, and automated Let's Encrypt SSL) on a self-hosted **DigitalOcean Droplet**.

---

## Architecture Overview

```
                                      Internet
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │         DigitalOcean Droplet          │
                     │  (Ubuntu 24.04 LTS with Docker Stack) │
                     └───────────────────┬───────────────────┘
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │          Nginx Reverse Proxy          │
                     │      Ports 80 (HTTP) & 443 (HTTPS)    │
                     │    Automated SSL Renewal (Certbot)    │
                     └───────┬───────────────────────┬───────┘
                             │                       │
           ┌─────────────────┴─────────┐   ┌─────────┴─────────────────┐
           │                           │   │                           │
           ▼                           ▼   ▼                           ▼
 ┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
 │   Frontend SPA    │       │    Express API    │       │   PostgreSQL 16   │
 │   (Vite + React)  │       │  (Node.js + WSS)  │       │ (Isolated Volume) │
 └───────────────────┘       └─────────┬─────────┘       └───────────────────┘
                                       │                           ▲
                                       └───────────────────────────┘
                                           Database Connection
```

### Database Isolation Guarantee (Coexisting with Other Droplet Databases)

If your DigitalOcean droplet already hosts other applications, websites, or databases, Peace Bundle is engineered with **100% isolated multi-tenancy**:

- **Zero Host Port Conflicts**: The PostgreSQL container (`peacebundle_db`) does **not** expose or bind port `5432` to the host Droplet. It communicates strictly through an internal Docker bridge. If your Droplet already has PostgreSQL, MySQL, or Redis running on port `5432` or any other port, there is **zero conflict**.
- **Private Virtual Network (`peacebundle_net`)**: The database is completely invisible to any other container or host service outside the `peacebundle_net` network.
- **Dedicated Storage Volume (`peacebundle_postgres_data`)**: Data files and tables are stored in a dedicated named volume, completely separated from any other application data.
- **Customizable Database & User**: Configurable via `POSTGRES_DB` (e.g. `peacebundle_prod_db`) and `POSTGRES_USER` in your `.env` so its database identity is unique.

---

## Step 1: Create Your DigitalOcean Droplet

1. Log into your [DigitalOcean Cloud Console](https://cloud.digitalocean.com/).
2. Click **Create** (top right) ➔ **Droplets**.
3. Configure the following specifications:
   - **Distribution**: **Ubuntu 24.04 LTS (x64)**.
   - **Plan**: **Basic**.
   - **CPU options**: **Regular** or **Premium Intel / AMD**.
   - **Size**: **1 GB / 2 GB RAM / 1 vCPU / 25–50 GB NVMe** (if using 1GB RAM, the setup script automatically adds 2GB swap space).
   - **Datacenter Region**: **London (LON1)**, **Frankfurt (FRA1)**, or **Amsterdam (AMS3)**.
   - **Authentication**: Choose **SSH Key** (recommended) or set a strong root password.
   - **Hostname**: `peace-bundle-prod` (or your preferred name).
4. Click **Create Droplet** and note your **Public IPv4 Address** (e.g. `159.65.x.x`).

---

## Step 2: Configure Domain DNS (A Records)

Log into your domain DNS provider (Namecheap, GoDaddy, Cloudflare, etc.):

Point your root domain, www, and optionally api to your Droplet IPv4:

| Type | Name / Host | Value / Target | TTL |
| :--- | :--- | :--- | :--- |
| **A** | `@` (or `peacebundlle.com`) | *Your Droplet IPv4 Address* | Automatic (or 300s) |
| **A** | `www` | *Your Droplet IPv4 Address* | Automatic (or 300s) |
| **A** | `api` (optional) | *Your Droplet IPv4 Address* | Automatic (or 300s) |

> [!NOTE]
> If using Cloudflare DNS, set the proxy status to **DNS Only** (grey cloud) during initial SSL certificate setup. Once SSL is active, you can re-enable Cloudflare proxying if desired.

---

## Step 3: Connect to Droplet & Run the Setup Script

SSH into your Droplet from your terminal (or PowerShell on Windows):

```bash
ssh root@YOUR_DROPLET_IP
```

Once connected, clone your repository and run the setup script:

```bash
# 1. Clone the repository
git clone https://github.com/zigs360/peace-bundle.git

# 2. Enter project directory
cd peace-bundle

# 3. Make scripts executable
chmod +x scripts/*.sh

# 4. Run automated droplet environment setup
sudo ./scripts/setup-droplet.sh
```

**What the setup script does automatically:**
- Configures a **2 GB Swap file** (essential for building and running containers on 1GB / 2GB droplets).
- Installs the latest stable **Docker Engine** & **Docker Compose**.
- Configures and enables the **UFW Firewall** allowing SSH (22), HTTP (80), and HTTPS (443).

---

## Step 4: Configure Production Environment Variables

Create your production `.env` file from the provided template:

```bash
cp .env.example .env
nano .env
```

Review and populate the required settings:

1. **Domain & SSL**:
   ```env
   DOMAIN_NAME=peacebundlle.com
   API_DOMAIN=api.peacebundlle.com
   SSL_EMAIL=admin@peacebundlle.com
   ```
2. **Frontend & App URLs**:
   ```env
   FRONTEND_URL=https://peacebundlle.com
   ```
3. **Database Configuration**:
   ```env
   POSTGRES_DB=peacebundle_prod_db
   POSTGRES_USER=peacebundle_admin
   POSTGRES_PASSWORD=CreateAStrongRandomPassword123!
   ```
4. **Application Secrets**:
   ```env
   JWT_SECRET=YourGenerated64CharacterSecretKeyHere
   ```
5. **Telecom & Payment Gateway Keys**:
   - `SMEPLUG_*`
   - `PAYVESSEL_*`
   - `BILLSTACK_*`
   - `SAFEHAVEN_*`
   - `SMTP_*`

Press `Ctrl + O` then `Enter` to save, and `Ctrl + X` to exit `nano`.

---

## Step 5: Migrate Existing Database from Render

Run our automated migration script to dump all user accounts, transactions, and wallets from Render and import them directly into your isolated PostgreSQL database:

```bash
./scripts/migrate-render-db.sh "YOUR_RENDER_EXTERNAL_DB_URL"
```

*(You can copy your External Database URL from Render Dashboard ➔ PostgreSQL ➔ Connect ➔ External Database URL).*

**What the script does automatically:**
1. Connects to your Render database via a temporary Docker PostgreSQL client.
2. Dumps all tables, relations, and data cleanly into a permanent backup file (`backups/render_migration_YYYYMMDD_HHMMSS.sql`).
3. Restores all records into your local PostgreSQL container (`peacebundle_db`).
4. Prints a verification table showing every table name (`Users`, `Wallets`, `Transactions`, etc.) and the exact row count migrated.

---

## Step 6: Initialize Free SSL Certificates (Let's Encrypt)

Ensure your domain DNS A-records are pointing to the Droplet IP before running this step:

```bash
./scripts/init-ssl.sh
```

This script will:
1. Verify which domains resolve in DNS (`peacebundlle.com`, `www.peacebundlle.com`, and `api.peacebundlle.com`).
2. Start Nginx with a temporary certificate.
3. Request genuine Let's Encrypt certificates for all verified domains.
4. Reload Nginx with full HTTPS support.
5. Auto-renewal is pre-configured and runs automatically in the background every 12 hours via the `certbot` container.

---

## Step 7: Launch the Complete Application Stack

Start all containers in detached mode:

```bash
docker compose up -d --build
```

Verify that all containers are healthy and running:

```bash
docker compose ps
```

You should see:
- `peacebundle_db` (healthy)
- `peacebundle_backend` (healthy)
- `peacebundle_frontend` (running)
- `peacebundle_nginx` (running, ports 80 & 443)
- `peacebundle_certbot` (running)

---

## Step 8: Verify Full Deployment

1. **Frontend**: Open `https://peacebundlle.com` in your browser. Confirm the UI loads with a valid SSL padlock.
2. **API Health**: Visit `https://peacebundlle.com/api/health` to verify that the backend and database connection report `status: "up"`.
3. **WebSockets**: Check browser console network tab (`WS` filter) for successful Socket.IO upgrade.

---

## Operational Commands & Maintenance

### Viewing Live Logs
```bash
# View backend logs (including API calls and background jobs)
docker compose logs -f backend

# View frontend web logs
docker compose logs -f frontend

# View Nginx access & error logs
docker compose logs -f nginx
```

### Deploying Code Updates in the Future
Whenever you push changes to GitHub, deploy them with:
```bash
cd /root/peace-bundle
git pull origin main
docker compose build frontend backend
docker compose up -d
```

### Backing Up the Database
To create a backup of your self-hosted PostgreSQL database:
```bash
docker compose exec -T db pg_dump -U peacebundle_admin peacebundle_prod_db > "backup_$(date +%Y%m%d_%H%M%S).sql"
```

To schedule automated daily backups:
```bash
crontab -e
# Add the following line to back up daily at 2:00 AM:
0 2 * * * cd /root/peace-bundle && docker compose exec -T db pg_dump -U peacebundle_admin peacebundle_prod_db > /root/backups/db_$(date +\%F).sql 2>&1
```
