# ==============================================================================
# Harmoni - Dockerfile Multi-Stage
# Otimizado para baixo footprint de memória, segurança e zero Node.js em produção
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build do Frontend (React + TypeScript + Vite)
# ------------------------------------------------------------------------------
FROM node:22-alpine AS frontend-builder
WORKDIR /app/web

# Instalar dependências com cache eficiente
COPY web/package*.json ./
RUN npm ci --prefer-offline --no-audit

# Compilar assets estáticos da SPA
COPY web/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Build do Backend (Go 1.26)
# ------------------------------------------------------------------------------
FROM golang:alpine AS backend-builder
WORKDIR /app

# Dependências do sistema para compilação CGO-free
RUN apk add --no-cache git ca-certificates tzdata

# Cache de dependências do Go
COPY go.mod go.sum* ./
RUN go mod download || true

# Copiar código-fonte Go
COPY cmd/ ./cmd/
COPY internal/ ./internal/

# Copiar assets estáticos gerados no Stage 1 para o local embutido pelo go:embed
COPY --from=frontend-builder /app/web/dist ./internal/adapters/inbound/http/web/dist/

# Compilar binário Go estático com stripping de símbolos de debug (-s -w)
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/harmoni ./cmd/server

# ------------------------------------------------------------------------------
# Stage 3: Runtime Final (Minimal Alpine + yt-dlp + ffmpeg)
# ------------------------------------------------------------------------------
FROM alpine:3.21 AS runtime

# Instalação das ferramentas essenciais de áudio e ingestão
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    ffmpeg \
    python3 \
    py3-pip \
    curl \
    && rm -rf /var/cache/apk/*

# Instalar ou atualizar yt-dlp diretamente para garantir suporte aos extratores mais recentes
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Criar diretórios de persistência
WORKDIR /app
RUN mkdir -p /music /data

# Copiar binário estático do Stage 2
COPY --from=backend-builder /bin/harmoni /app/harmoni

# Configurações padrão de ambiente
ENV PORT=8080 \
    MUSIC_DIR=/music \
    DATA_DIR=/data \
    ENV=production

EXPOSE 8080

# Healthcheck interno
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/rest/ping.view || exit 1

ENTRYPOINT ["/app/harmoni"]
