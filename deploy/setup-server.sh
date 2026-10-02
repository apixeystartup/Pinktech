#!/bin/bash
# Pinktech Server Setup Script
# Run this once on a fresh Ubuntu Oracle Cloud VM
# Usage: bash setup-server.sh

set -e  # Exit on error

echo "========================================="
echo "  Pinktech Server Setup"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as ubuntu user
if [ "$USER" != "ubuntu" ]; then
    echo -e "${YELLOW}Warning: Script designed for 'ubuntu' user. Current user: $USER${NC}"
fi

# Update system
echo -e "${GREEN}[1/8] Updating system packages...${NC}"
sudo apt update && sudo apt upgrade -y

# Install Node.js 22
echo -e "${GREEN}[2/8] Installing Node.js 22...${NC}"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node version
NODE_VERSION=$(node -v)
echo -e "${GREEN}Node.js version: $NODE_VERSION${NC}"

# Install PM2
echo -e "${GREEN}[3/8] Installing PM2...${NC}"
sudo npm install -g pm2

# Install Nginx
echo -e "${GREEN}[4/8] Installing Nginx...${NC}"
sudo apt install -y nginx

# Install Git and build tools
echo -e "${GREEN}[5/8] Installing Git and build tools...${NC}"
sudo apt install -y git build-essential

# Clone repository
echo -e "${GREEN}[6/8] Cloning repository...${NC}"
cd ~
if [ -d "Pinktech" ]; then
    echo "Repository already exists, pulling latest..."
    cd Pinktech
    git pull origin main
else
    git clone https://github.com/apixeystartup/Pinktech.git
    cd Pinktech
fi

# Install dependencies
echo -e "${GREEN}[7/8] Installing dependencies...${NC}"
npm install

# Setup environment file
echo -e "${GREEN}[8/8] Setting up environment...${NC}"
if [ ! -f ".env" ]; then
    cp deploy/.env.production .env
    echo -e "${YELLOW}Please edit .env file with your actual values:${NC}"
    echo "  nano ~/.Pinktech/.env"
    echo ""
    echo "Required values:"
    echo "  - MONGO_URI (your MongoDB Atlas connection string)"
    echo "  - JWT_ACCESS_SECRET (random 64-char hex)"
    echo "  - JWT_REFRESH_SECRET (random 64-char hex)"
    echo "  - SUPER_ADMIN_EMAIL"
    echo "  - SUPER_ADMIN_PASSWORD"
fi

# Build frontend
echo -e "${GREEN}Building frontend...${NC}"
npm run build:frontend

# Seed super admin
echo -e "${GREEN}Seeding super admin...${NC}"
npm run seed:super-admin

# Configure Nginx
echo -e "${GREEN}Configuring Nginx...${NC}"
sudo cp deploy/nginx.conf /etc/nginx/sites-available/pinktech
sudo ln -sf /etc/nginx/sites-available/pinktech /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# Start services with PM2
echo -e "${GREEN}Starting services with PM2...${NC}"
pm2 start deploy/ecosystem.config.js
pm2 save

# Setup PM2 to start on boot
echo -e "${GREEN}Setting up PM2 startup...${NC}"
pm2 startup ubuntu -u ubuntu --hp /home/ubuntu

echo ""
echo "========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Edit .env file: nano ~/.Pinktech/.env"
echo "2. Restart services: pm2 restart all"
echo "3. Check status: pm2 status"
echo "4. View logs: pm2 logs"
echo ""
echo "Nginx config: /etc/nginx/sites-enabled/pinktech"
echo "PM2 config: /home/ubuntu/Pinktech/deploy/ecosystem.config.js"
echo ""
echo "Access your app at: http://YOUR_VM_IP"
echo "========================================="
