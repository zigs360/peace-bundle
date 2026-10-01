#!/bin/bash
set -e

# ==============================================================================
# Peace Bundle - Render to DigitalOcean Database Migration Script
# ==============================================================================
# This script dumps your live PostgreSQL database from Render and imports it
# directly into your local DigitalOcean PostgreSQL Docker container.
#
# Usage:
#   ./scripts/migrate-render-db.sh [RENDER_EXTERNAL_DB_URL]
#
# Or set in environment:
#   export RENDER_DATABASE_URL="postgresql://user:pass@host.render.com/dbname"
#   ./scripts/migrate-render-db.sh
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}  Peace Bundle: Render -> DigitalOcean PostgreSQL Migration    ${NC}"
echo -e "${BLUE}================================================================${NC}"

# Check .env existence
if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found in current directory.${NC}"
  echo "Please create .env (copy from .env.example) and set POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB."
  exit 1
fi

# Load local environment variables safely
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

POSTGRES_USER="${POSTGRES_USER:-peacebundlle_user}"
POSTGRES_DB="${POSTGRES_DB:-peacebundlle}"

if [ -z "$POSTGRES_PASSWORD" ]; then
  echo -e "${RED}Error: POSTGRES_PASSWORD is not set in .env${NC}"
  exit 1
fi

# Determine Render database connection URL
RENDER_URL="$1"
if [ -z "$RENDER_URL" ]; then
  RENDER_URL="$RENDER_DATABASE_URL"
fi

if [ -z "$RENDER_URL" ]; then
  echo -e "${YELLOW}Please enter your Render External Database URL.${NC}"
  echo -e "You can find this in Render Dashboard ➔ Your Postgres Database ➔ Connect ➔ 'External Database URL':"
  read -r -p "Render External DB URL: " RENDER_URL
fi

if [ -z "$RENDER_URL" ]; then
  echo -e "${RED}Error: Render Database URL cannot be empty.${NC}"
  exit 1
fi

# Mask URL password for clean logging
MASKED_URL=$(echo "$RENDER_URL" | sed -E 's/(:\/\/[^:]+:)[^@]+(@)/\1****\2/')
echo -e "${GREEN}✓ Source Database:${NC} $MASKED_URL"
echo -e "${GREEN}✓ Destination Database:${NC} Local Docker container 'peacebundle_db' (DB: $POSTGRES_DB, User: $POSTGRES_USER)"

# 1. Ensure local PostgreSQL container is running
echo -e "\n${BLUE}Step 1: Checking local PostgreSQL Docker container...${NC}"
if ! docker compose ps --services --filter "status=running" | grep -q "^db$"; then
  echo "Starting local PostgreSQL container..."
  docker compose up -d db
  echo "Waiting for PostgreSQL to be ready..."
  sleep 6
fi

# Verify db container health
docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" || {
  echo -e "${RED}Error: Local PostgreSQL container is not accepting connections.${NC}"
  exit 1
}
echo -e "${GREEN}✓ Local PostgreSQL is ready.${NC}"

# 2. Create backups folder
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/render_migration_${TIMESTAMP}.sql"

# 3. Dump database from Render using Docker (no host postgresql-client required)
echo -e "\n${BLUE}Step 2: Exporting data from Render PostgreSQL...${NC}"
echo "Running pg_dump (schema, data, constraints, sequences)..."

docker run --rm \
  --network host \
  postgres:16-alpine \
  pg_dump "$RENDER_URL" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists > "$BACKUP_FILE"

# Check if dump succeeded and has content
if [ ! -s "$BACKUP_FILE" ]; then
  echo -e "${RED}Error: Export failed or generated an empty file. Check your Render URL or connection.${NC}"
  rm -f "$BACKUP_FILE"
  exit 1
fi

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo -e "${GREEN}✓ Export completed successfully!${NC}"
echo "Saved local backup copy to: $BACKUP_FILE (Size: $FILE_SIZE)"

# 4. Import the dump into the local PostgreSQL container
echo -e "\n${BLUE}Step 3: Importing data into local DigitalOcean PostgreSQL...${NC}"

# Stop backend container temporarily to prevent schema contention if running
BACKEND_WAS_RUNNING=false
if docker compose ps --services --filter "status=running" | grep -q "^backend$"; then
  echo "Temporarily pausing backend container during import..."
  docker compose stop backend
  BACKEND_WAS_RUNNING=true
fi

echo "Restoring tables, rows, sequences, and indexes into '$POSTGRES_DB'..."
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$BACKUP_FILE"

echo -e "${GREEN}✓ Import completed successfully!${NC}"

# 5. Restart backend if it was running
if [ "$BACKEND_WAS_RUNNING" = true ]; then
  echo -e "\n${BLUE}Restarting backend container...${NC}"
  docker compose start backend
fi

# 6. Verify row counts
echo -e "\n${BLUE}================================================================${NC}"
echo -e "${BLUE}  Migration Verification & Row Counts                          ${NC}"
echo -e "${BLUE}================================================================${NC}"

COUNT_QUERY="
DO \$\$
DECLARE
    r RECORD;
    cnt BIGINT;
BEGIN
    RAISE NOTICE '------------------------------------------------';
    RAISE NOTICE '%-35s | %s', 'Table Name', 'Row Count';
    RAISE NOTICE '------------------------------------------------';
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        ORDER BY tablename
    ) LOOP
        EXECUTE format('SELECT count(*) FROM %I', r.tablename) INTO cnt;
        RAISE NOTICE '%-35s | %s', r.tablename, cnt;
    END LOOP;
    RAISE NOTICE '------------------------------------------------';
END \$\$;
"

docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$COUNT_QUERY" 2>&1 | grep "NOTICE:" | sed 's/NOTICE:  //'

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}  Migration Complete! All data migrated to DigitalOcean.       ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo "A permanent copy of the exported database is saved at: $BACKUP_FILE"
echo "You can now start all services with: docker compose up -d"
