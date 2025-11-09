FROM node:20-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production

# Stage final
FROM node:20-alpine

WORKDIR /app

# Copiar node_modules del builder
COPY --from=builder /app/node_modules ./node_modules

# Copiar código fuente
COPY . .

# Crear directorio para keys
RUN mkdir -p /app/keys

# Exponer puerto (Cloud Run usa PORT env var)
EXPOSE 8080

# Usuario no-root por seguridad
USER node

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando para iniciar
CMD ["node", "server.js"]