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
echo -e "${GREEN}[1/5] Pulling latest code...${NC}"
git pull origin main

# Install dependencies
echo -e "${GREEN}[2/5] Installing dependencies...${NC}"
npm install

# Build frontend
echo -e "${GREEN}[3/5] Building frontend...${NC}"
npm run build:frontend

# Restart services
echo -e "${GREEN}[4/5] Restarting services...${NC}"
pm2 restart all

# Reload Nginx (in case config changed)
echo -e "${GREEN}[5/5] Reloading Nginx...${NC}"
sudo systemctl reload nginx

echo ""
echo "========================================="
echo -e "${GREEN}Deployment Complete!${NC}"
echo "========================================="
echo ""
echo "Check status: pm2 status"
echo "View logs: pm2 logs"
echo "========================================="
