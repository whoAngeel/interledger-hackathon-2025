#!/bin/bash
set -e

echo "=== Interledger Backend — VPS Deploy ==="
echo ""

# Check dependencies
command -v docker >/dev/null 2>&1 || { echo "❌ Docker no instalado. Instálalo: https://docs.docker.com/engine/install/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "❌ Docker Compose no encontrado."; exit 1; }

# Check required files
[ -f dev.key ] || { echo "❌ Falta dev.key — genera una llave en https://wallet.interledger-test.dev/"; exit 1; }
[ -f .env ] || { echo "❌ Falta .env — cópialo desde env.example y configúralo"; exit 1; }

# Load env vars
set -a; source .env; set +a

# Generate secure passwords if not set
if [ -z "$REDIS_PASSWORD" ]; then
  REDIS_PASSWORD=$(openssl rand -hex 16)
  echo "REDIS_PASSWORD=$REDIS_PASSWORD" >> .env
  echo "✅ Redis password generated"
fi
if [ -z "$MONGO_PASSWORD" ]; then
  MONGO_PASSWORD=$(openssl rand -hex 16)
  echo "MONGO_PASSWORD=$MONGO_PASSWORD" >> .env
  echo "MONGO_USER=admin" >> .env
  echo "✅ MongoDB credentials generated"
fi

echo ""
echo "=== Building and starting services ==="
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "=== Waiting for services to be healthy ==="
sleep 5
docker compose -f docker-compose.prod.yml ps

echo ""
echo "=== Testing health endpoint ==="
sleep 3
curl -s http://localhost:8080/health | python3 -m json.tool 2>/dev/null || echo "⚠️  Health check not ready yet, check: docker compose -f docker-compose.prod.yml logs backend"

echo ""
echo "=== Deploy complete ==="
echo "Backend:     http://$(hostname -I | awk '{print $1}'):8080"
echo "Health:      http://$(hostname -I | awk '{print $1}'):8080/health"
echo "Console:     http://$(hostname -I | awk '{print $1}'):8080/"
echo ""
echo "Logs:        docker compose -f docker-compose.prod.yml logs -f backend"
echo "Restart:     docker compose -f docker-compose.prod.yml restart backend"
echo "Stop:        docker compose -f docker-compose.prod.yml down"
echo "Update:      git pull && docker compose -f docker-compose.prod.yml up -d --build"
