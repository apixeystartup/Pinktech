# Pinktech Deployment Guide

Complete guide to deploy Pinktech on Oracle Cloud Always Free + Cloudflare Pages + MongoDB Atlas.

## Architecture

```
Users → Cloudflare Pages (Frontend CDN) → Oracle VM (Nginx → Gateway → 8 Services) → MongoDB Atlas
```

**Cost: $0 forever** (Oracle Always Free + Cloudflare Pages + MongoDB Atlas M0)

---

## Prerequisites

| Requirement | Status |
|-------------|--------|
| GitHub repo | ✅ https://github.com/apixeystartup/Pinktech |
| MongoDB Atlas | ✅ cluster0.obiu2me.mongodb.net |
| Oracle Cloud account | ⏳ Waiting for capacity |
| Cloudflare account | ⬜ Create at dash.cloudflare.com |
| Node.js 22.12+ (local) | ✅ For local testing |

---

## Phase 1: Oracle Cloud VM Setup

### 1.1 Create Instance

1. Login to [cloud.oracle.com](https://cloud.oracle.com)
2. **Compute** → **Instances** → **Create Instance**
3. Configure:
   - **Name:** `pinktech-server`
   - **Image:** Canonical Ubuntu 24.04
   - **Shape:** VM.Standard.A1.Flex (ARM)
   - **OCPU:** 4 (or 2 if capacity limited)
   - **RAM:** 24 GB (or 12 GB)
   - **VCN:** Select existing or create new public subnet
   - **Public IP:** Automatically assign
   - **SSH Keys:** Generate new key pair → Download private key
4. Click **Create**
5. Wait for **Running** status
6. Note the **Public IP address**

### 1.2 Connect via SSH

```bash
# Navigate to where you saved the .key file
cd ~/Downloads

# Set correct permissions (Windows)
icacls your-key.key /inheritance:r /grant:r "%USERNAME%:R"

# Connect
ssh -i your-key.key ubuntu@YOUR_VM_IP
```

### 1.3 Run Setup Script

```bash
# Clone repo (if not using setup script)
git clone https://github.com/apixeystartup/Pinktech.git
cd Pinktech

# Make script executable
chmod +x deploy/setup-server.sh

# Run setup
bash deploy/setup-server.sh
```

### 1.4 Configure Environment

```bash
nano ~/Pinktech/.env
```

Update these values:

| Variable | Value |
|----------|-------|
| MONGO_URI | Your Atlas connection string |
| JWT_ACCESS_SECRET | Random 64-char hex |
| JWT_REFRESH_SECRET | Random 64-char hex |
| SUPER_ADMIN_EMAIL | Your admin email |
| SUPER_ADMIN_PASSWORD | Strong password (8+ chars) |

Save: `Ctrl+O` → `Enter` → `Ctrl+X`

```bash
# Restart services after env change
cd ~/Pinktech
pm2 restart all
```

### 1.5 Configure Oracle Firewall

1. Go to Oracle Cloud → Your VCN → **Security List**
2. **Add Ingress Rules:**

| Source | Destination Port | Protocol |
|--------|------------------|----------|
| 0.0.0.0/0 | 22 | TCP (SSH) |
| 0.0.0.0/0 | 80 | TCP (HTTP) |
| 0.0.0.0/0 | 443 | TCP (HTTPS) |

3. **Save** rules

### 1.6 Test Backend

```bash
# From local machine
curl http://YOUR_VM_IP/api/v1/public/health
```

Open browser: `http://YOUR_VM_IP`

---

## Phase 2: Cloudflare Pages (Frontend)

### 2.1 Create Cloudflare Account

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Sign up (free, no credit card required)
3. Verify email

### 2.2 Deploy to Cloudflare Pages

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorize GitHub
3. Select repository: `apixeystartup/Pinktech`
4. Configure build settings:

| Setting | Value |
|---------|-------|
| Framework preset | Vite |
| Build command | `cd frontend && npm install && npm run build` |
| Output directory | `frontend/dist` |

5. Add environment variable:

| Key | Value |
|-----|-------|
| VITE_API_BASE_URL | `http://YOUR_VM_IP/api/v1` |

6. **Save and Deploy**

### 2.3 Get Cloudflare URL

After deployment, Cloudflare provides:
```
https://pinktech-xxxx.pages.dev
```

Test: Open this URL → Login page should appear

### 2.4 (Optional) Custom Domain

1. Cloudflare Pages → Your project → **Custom domains**
2. Add domain (e.g., `app.yourdomain.com`)
3. Update DNS: Point to Cloudflare Pages

---

## Phase 3: SSL/HTTPS (Optional)

### Option A: Cloudflare Proxy (Easiest)

1. Add your domain to Cloudflare (free plan)
2. Enable **Proxy** (orange cloud) for DNS record
3. SSL/TLS → **Full** encryption
4. Cloudflare provides free SSL

### Option B: Let's Encrypt on Oracle VM

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is set up automatically
```

---

## Phase 4: Updates & Maintenance

### Update App

```bash
ssh -i your-key.key ubuntu@YOUR_VM_IP
cd ~/Pinktech
bash deploy/deploy.sh
```

### Check Service Status

```bash
pm2 status
pm2 logs
pm2 monit
```

### View Nginx Logs

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Restart Services

```bash
pm2 restart all
sudo systemctl restart nginx
```

### Database Backup

MongoDB Atlas free tier includes daily backups. For manual backup:

```bash
mongodump --uri="mongodb+srv://user:pass@cluster0.mongodb.net/pink_saas" --out=/backup/
```

---

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| NODE_ENV | Environment mode | `production` |
| PORT | Gateway port | `5001` |
| MONGO_URI | MongoDB Atlas connection | `mongodb+srv://...` |
| JWT_ACCESS_SECRET | JWT access token secret | Random 64-char hex |
| JWT_REFRESH_SECRET | JWT refresh token secret | Random 64-char hex |
| JWT_ACCESS_EXPIRES_IN | Access token expiry | `15m` |
| JWT_REFRESH_EXPIRES_IN | Refresh token expiry | `7d` |
| SUPER_ADMIN_EMAIL | Admin login email | `admin@example.com` |
| SUPER_ADMIN_PASSWORD | Admin password | `StrongPass123!` |
| QUEUES_ENABLED | Enable job queues | `false` |
| EMAIL_MODE | Email mode | `mock` or `smtp` |

---

## Troubleshooting

### Services Won't Start

```bash
# Check PM2 logs
pm2 logs

# Check if ports are in use
sudo netstat -tlnp | grep -E '400[1-8]|5001'

# Restart all services
pm2 restart all
```

### Cannot Access from Browser

```bash
# Check Nginx status
sudo systemctl status nginx

# Test Nginx config
sudo nginx -t

# Check firewall
sudo ufw status
```

### MongoDB Connection Error

```bash
# Test connection
node -e "require('mongoose').connect(process.env.MONGO_URI).then(() => console.log('Connected')).catch(e => console.error(e))"
```

### Frontend Shows Blank Page

1. Check Cloudflare Pages build logs
2. Verify `VITE_API_BASE_URL` is correct
3. Check browser console for CORS errors
4. Verify Oracle VM firewall allows port 80

### Port Already in Use

```bash
# Find process using port
sudo lsof -i :5001

# Kill process
sudo kill -9 PID
```

---

## Resource Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| Oracle VM RAM | 24 GB (4 OCPU) | Always Free tier |
| Oracle VM Storage | 200 GB | Boot volume |
| MongoDB Atlas RAM | 512 MB | Free M0 tier |
| MongoDB Atlas Connections | 100 | Free M0 tier |
| Cloudflare Pages Bandwidth | Unlimited | Free tier |
| Cloudflare Pages Builds | 500/month | Free tier |

---

## Cost Summary

| Service | Cost | Notes |
|---------|------|-------|
| Oracle Cloud VM | $0/month | Always Free tier |
| Cloudflare Pages | $0/month | Free tier |
| MongoDB Atlas M0 | $0/month | Free tier |
| Cloudflare CDN/SSL | $0/month | Free tier |
| **Total** | **$0/month** | **Free forever** |

---

## Security Checklist

- [x] JWT secrets are random and unique
- [x] MongoDB Atlas has IP whitelisting (optional)
- [x] Services run on localhost only (not exposed)
- [x] Gateway verifies JWT before proxying
- [x] Nginx security headers configured
- [ ] SSL/HTTPS enabled (optional but recommended)
- [ ] MongoDB Atlas IP whitelist updated
- [ ] Regular password rotation

---

## Support

- **GitHub Issues:** https://github.com/apixeystartup/Pinktech/issues
- **Oracle Cloud Docs:** https://docs.oracle.com/en-us/iaas/
- **Cloudflare Docs:** https://developers.cloudflare.com/pages/
- **MongoDB Atlas Docs:** https://www.mongodb.com/docs/atlas/
