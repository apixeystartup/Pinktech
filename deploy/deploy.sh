#!/bin/bash
# Pinktech Deployment Update Script
# Run this to update the app after code changes
# Usage: bash deploy.sh

set -e

echo "========================================="
echo "  Pinktech Deployment Update"
echo "========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd ~/Pinktech

# Pull latest changes
echo -e "${GREEN}[1/6] Pulling latest code...${NC}"
# npm on Linux and npm on Windows disagree about the lockfile's optional
# "libc" metadata, so a stray install can leave the lock modified and block
# the pull. The lock is committed as-is; restore it before pulling.
git checkout -- package-lock.json 2>/dev/null || true
git pull origin main

# Stop the PM2 services before installing. The Always Free VM has ~1GB RAM;
# running `npm ci` (and the Vite build) while 10 Node services are up starves
# memory, fills swap, and stalls the deploy forever at the install step.
echo -e "${YELLOW}[2/6] Stopping services for install...${NC}"
pm2 stop all

# Install dependencies from the committed lockfile. `npm ci` installs exactly
# what package-lock.json pins and never rewrites it, so the tree stays clean
# for the next deploy (npm install used to strip the "libc" entries on Linux).
echo -e "${GREEN}[3/6] Installing dependencies...${NC}"
npm ci --no-audit --no-fund

# Build frontend
echo -e "${GREEN}[4/6] Building frontend...${NC}"
npm run build:frontend

# Restart services
echo -e "${GREEN}[5/6] Restarting services...${NC}"
pm2 startOrReload deploy/ecosystem.config.js --update-env
pm2 save --force

# Reload Nginx (in case config changed)
echo -e "${GREEN}[6/6] Reloading Nginx...${NC}"
sudo systemctl reload nginx

echo ""
echo "========================================="
echo -e "${GREEN}Deployment Complete!${NC}"
echo "========================================="
echo ""
echo "Check status: pm2 status"
echo "View logs: pm2 logs"
echo "========================================="
