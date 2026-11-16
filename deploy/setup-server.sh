#!/usr/bin/env bash
# One-time setup for a fresh Hetzner Ubuntu 24.04 server.
# Run as root:  bash setup-server.sh
set -euo pipefail

read -rp "GitHub repo (owner/name, e.g. jdoe/WindIQ-Case-Study): " REPO
read -rp "Production domain [leave empty to use <ip>.sslip.io]: " PROD_DOMAIN
read -rp "Development domain [leave empty to use dev.<ip>.sslip.io]: " DEV_DOMAIN
echo "Paste the PUBLIC key of the GitHub Actions deploy key (ssh-ed25519 ...):"
read -r DEPLOY_PUBKEY

IP=$(curl -fsS4 https://ifconfig.me)
PROD_DOMAIN=${PROD_DOMAIN:-$IP.sslip.io}
DEV_DOMAIN=${DEV_DOMAIN:-dev.$IP.sslip.io}

echo "==> Updating system"
apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y upgrade
apt-get install -y ca-certificates curl ufw fail2ban unattended-upgrades

echo "==> Installing Docker"
curl -fsSL https://get.docker.com | sh

echo "==> Creating 'deploy' user (used by GitHub Actions)"
id deploy &>/dev/null || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
grep -qxF "$DEPLOY_PUBKEY" /home/deploy/.ssh/authorized_keys || echo "$DEPLOY_PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "==> Preparing /opt/windiq"
install -d -o deploy -g deploy /opt/windiq
cat > /opt/windiq/.env <<ENV
IMAGE_REPO=ghcr.io/${REPO,,}
PROD_DOMAIN=$PROD_DOMAIN
DEV_DOMAIN=$DEV_DOMAIN
ENV
touch /opt/windiq/app.development.env /opt/windiq/app.production.env
chown deploy:deploy /opt/windiq/.env /opt/windiq/app.*.env
chmod 600 /opt/windiq/app.*.env

echo "==> Firewall: allow SSH, HTTP, HTTPS only"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Hardening SSH (key-only login)"
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<SSH
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSH
# Ubuntu 24.04 uses socket activation (ssh.socket): new connections already
# read the new config. Reload only if the classic service is running.
systemctl try-reload-or-restart ssh.service || true

systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "Done."
echo "  Production URL:  https://$PROD_DOMAIN"
echo "  Development URL: https://$DEV_DOMAIN"
echo "  Server IP (GitHub secret SSH_HOST): $IP"
echo "  Host key line for GitHub secret SSH_KNOWN_HOSTS:"
ssh-keyscan -t ed25519 localhost 2>/dev/null | sed "s/^localhost/$IP/"
