# Hybrid Deployment Migration Guide: DigitalOcean (Backend & DB) + Vercel (Frontend)

This guide walks you through migrating the **Peace Bundle backend and PostgreSQL database** to a self-hosted **DigitalOcean Droplet**, while keeping your **Frontend on Vercel**.

---

## Architecture Overview

```
                          Users & Web Browsers
                                   │
                 ┌─────────────────┴─────────────────┐
                 │                                   │
                 ▼                                   ▼
        Frontend (Vercel)                    Backend & Database (DigitalOcean)
   https://peacebundlle.com                     https://api.peacebundlle.com
   https://www.peacebundlle.com                              │
                 │                                           ▼
                 │ API calls / rewrites            ┌───────────────────┐
                 └────────────────────────────────►│       Nginx       │ (Ports 80/443 + Let's Encrypt)
                                                   └─────────┬─────────┘
                                                             │
                                                   ┌─────────┴─────────┐
                                                   │                   │
                                                   ▼                   ▼
                                         ┌───────────────────┐ ┌───────────────┐
                                         │ Express Backend   │ │ PostgreSQL 16 │
                                         │ (Node.js + WSS)   │◄┼─► (Docker Vol)│
                                         └───────────────────┘ └───────────────┘
```

---

## Step 1: Create Your DigitalOcean Droplet

1. Log into your [DigitalOcean Cloud Console](https://cloud.digitalocean.com/).
2. Click **Create** (top right) ➔ **Droplets**.
3. Configure the following specifications:
   - **Distribution**: **Ubuntu 24.04 LTS (x64)**.
   - **Plan**: **Basic**.
   - **CPU options**: **Regular** or **Premium Intel / AMD**.
   - **Size**: At least **2 GB RAM / 1 vCPU / 50 GB NVMe** (approx. \$12–\$14/month).
   - **Datacenter Region**: **London (LON1)** or **Frankfurt (FRA1)** (recommended for optimal latency between Nigeria, Europe, and external VTU gateways).
   - **Authentication**: Choose **SSH Key** (recommended) or set a strong root password.
   - **Hostname**: `peace-bundle-api` (or your preferred name).
4. Click **Create Droplet** and wait 30 seconds for it to provision.
5. Note your new **Public IPv4 Address** (e.g. `159.65.x.x`).

---

## Step 2: Configure DNS for API Subdomain

Log into your domain DNS provider (Namecheap, GoDaddy, Cloudflare, etc.):

1. **Leave your existing root (`@`) and `www` records pointing to Vercel**:
   - Do NOT change your root `@` or `www` records if your frontend is on Vercel.
2. **Add an A record for your API subdomain**:

| Type | Name / Host | Value / Target | TTL |
| :--- | :--- | :--- | :--- |
| **A** | `api` | *Your Droplet IPv4 Address* | Automatic (or 300s) |

> [!NOTE]
> If using Cloudflare DNS, set the proxy status for `api` to **DNS Only** (grey cloud) during initial SSL certificate setup.

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
- Configures a **2 GB Swap file** to protect the Droplet from memory spikes.
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

1. **API Domain & SSL**:
   ```env
   API_DOMAIN=api.peacebundlle.com
   SSL_EMAIL=admin@peacebundlle.com
   ```
2. **Database Password**:
   ```env
   POSTGRES_DB=peacebundlle
   POSTGRES_USER=peacebundlle_user
   POSTGRES_PASSWORD=CreateAStrongRandomPassword123!
   ```
3. **Application Secrets & Allowed Frontend**:
   ```env
   JWT_SECRET=YourGenerated64CharacterSecretKeyHere
   FRONTEND_URL=https://www.peacebundlle.com
   ```
4. **VTU & Payment Gateway Keys**:
   - `SMEPLUG_*`
   - `PAYVESSEL_*`
   - `BILLSTACK_*`
   - `SAFEHAVEN_*`
   - `SMTP_*`

Press `Ctrl + O` then `Enter` to save, and `Ctrl + X` to exit `nano`.

---

## Step 5: (Optional) Migrate Existing Database from Render

If you have existing user accounts, wallets, and transactions on Render that you want to move over:

### 1. Dump database from Render
Run on your local computer or temporary machine having `pg_dump`:
```bash
pg_dump "postgres://peacebundlle_user:PASSWORD@dpg-xxxxx.render.com/peacebundlle" > render_backup.sql
```

### 2. Copy the dump to your Droplet
```bash
scp render_backup.sql root@YOUR_DROPLET_IP:/root/peace-bundle/
```

### 3. Start the Database container on the Droplet
```bash
cd /root/peace-bundle
docker compose up -d db
```

Wait 10 seconds for PostgreSQL to initialize, then restore:
```bash
docker compose exec -T db psql -U peacebundlle_user -d peacebundlle < render_backup.sql
```

---

## Step 6: Initialize Free SSL Certificates (Let's Encrypt)

Ensure `api.peacebundlle.com` is pointing to the Droplet IP before running this step:

```bash
./scripts/init-ssl.sh
```

This script will:
1. Start Nginx with a temporary certificate.
2. Request a trusted SSL certificate from Let's Encrypt for `api.peacebundlle.com`.
3. Reload Nginx with full HTTPS support.
4. Auto-renewal runs automatically in the background every 12 hours via the `certbot` container.

---

## Step 7: Launch the Application Stack

Start all containers in detached mode:

```bash
docker compose up -d
```

Verify that all containers are healthy and running:

```bash
docker compose ps
```

You should see:
- `peacebundle_db` (healthy)
- `peacebundle_backend` (healthy)
- `peacebundle_nginx` (running, ports 80 & 443)
- `peacebundle_certbot` (running)

---

## Step 8: Update Frontend on Vercel

In your Vercel project dashboard:
1. Go to **Settings** ➔ **Environment Variables**.
2. Add / Update:
   - `VITE_API_URL`: `https://api.peacebundlle.com/api`
   - `VITE_SOCKET_URL`: `https://api.peacebundlle.com`
3. Trigger a redeploy of your Vercel project (or push the new code to GitHub which automatically redeploys via Vercel git integration).
4. `vercel.json` in your repository will also route `/api/*` rewrites to `https://api.peacebundlle.com/api/*`.

---

## Step 9: Verify Full Deployment

1. **Backend Health**: Visit `https://api.peacebundlle.com/api/health` in your browser. Confirm:
   ```json
   {
     "status": "up",
     "database": { "status": "up" }
   }
   ```
2. **Frontend**: Open `https://peacebundlle.com`. Log in and verify account data, balances, and real-time transaction updates.
3. **WebSockets**: Check the browser console network tab (`WS` filter) to confirm connection to `wss://api.peacebundlle.com/socket.io/`.

---

## Operational Commands & Maintenance

### Viewing Live Backend Logs
```bash
# View live backend logs
docker compose logs -f backend

# View live Nginx access & error logs
docker compose logs -f nginx
```

### Deploying Code Updates
Whenever you push code changes to GitHub:
```bash
cd /root/peace-bundle
git pull origin main
docker compose build backend
docker compose up -d backend
```

### Backing Up the Database
To create a backup of your PostgreSQL database:
```bash
docker compose exec -T db pg_dump -U peacebundlle_user peacebundlle > "backup_$(date +%Y%m%d_%H%M%S).sql"
```

To schedule automated daily backups:
```bash
crontab -e
# Add the following line to back up daily at 2:00 AM:
0 2 * * * cd /root/peace-bundle && docker compose exec -T db pg_dump -U peacebundlle_user peacebundlle > /root/backups/db_$(date +\%F).sql 2>&1
```
