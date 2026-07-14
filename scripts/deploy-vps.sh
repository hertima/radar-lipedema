#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/radar-lipedema}"
APP_PORT="${APP_PORT:-3000}"

echo "Radar Lipedema - deploy VPS"
echo "Pasta do app: ${APP_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker..."
  sudo apt update
  sudo apt install -y docker.io docker-compose-plugin
  sudo systemctl enable --now docker
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin nao encontrado."
  exit 1
fi

cd "${APP_DIR}"

if [ ! -f ".env" ]; then
  echo "Criando .env a partir do .env.example..."
  cp .env.example .env
  echo "Edite ${APP_DIR}/.env e troque POSTGRES_PASSWORD/PGPASSWORD por uma senha forte."
  exit 1
fi

echo "Subindo app, HTML, imagens, API Node e PostgreSQL..."
docker compose up -d --build

echo "Status dos containers:"
docker compose ps

echo "Teste:"
echo "  http://IP_DA_VPS:${APP_PORT}"
echo "  http://IP_DA_VPS:${APP_PORT}/api/health"
