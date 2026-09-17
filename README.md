# Harmoni 🎵

[![Go](https://img.shields.io/badge/Go-1.26-00ADD8?style=flat&logo=go)](https://go.dev)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17%2B_pgvector-336791?style=flat&logo=postgresql)](https://github.com/pgvector/pgvector)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat&logo=docker)](https://www.docker.com)
[![Coolify](https://img.shields.io/badge/Coolify-Compatible-6B21A8?style=flat)](https://coolify.io)

**Harmoni** é um servidor de streaming de música *self-hosted*, ultraeficiente e inteligente, projetado para operar com consumo mínimo de recursos (< 35 MB de RAM no backend em repouso) em VPS modestas (512 MB a 1 GB de RAM), sem comprometer qualidade, velocidade ou recursos modernos.

---

## ✨ Principais Funcionalidades

1. **Streaming Direto de Alta Performance:**
   - Respostas nativas a cabeçalhos `Range: bytes=X-Y` com código HTTP `206 Partial Content` via `http.ServeContent`.
   - *Zero transcoding em tempo real:* o arquivo original (`FLAC`, `MP3`, `M4A`, `Opus`, `OGG`, `WAV`, `AAC`) é transmitido diretamente sem overhead de CPU.
   - Suporte a busca (*seek*) instantânea.

2. **Rádio Inteligente por Similaridade Vetorial (Smart Brain):**
   - Vetores semânticos gerados automaticamente para cada faixa e indexados via **PostgreSQL com `pgvector`** (índice HNSW com métrica de cosseno).
   - Mecanismo anti-repetição com penalização dinâmica para artistas repetidos e desempate estocástico.
   - Fila contínua (*Autoplay Infinito*): quando restam 2 faixas na fila, novas recomendações são adicionadas automaticamente.

3. **Compatibilidade com OpenSubsonic API:**
   - Conecte clientes consolidados como **Symfonium** (Android), **Ample** (iOS), **Feishin** (Desktop) ou **DSub**.
   - Endpoints implementados: `ping.view`, `getArtists.view`, `getArtist.view`, `getAlbum.view`, `getSong.view`, `stream.view`, `download.view` e `getSimilarSongs.view` (integrado ao motor vetorial).
   - Autenticação por Token + Salt (MD5 hashing) conforme especificação OpenSubsonic v1.16.1+.

4. **Aquisição de Mídia (Downloader Integrado Throttled):**
   - Endpoint e interface para ingestão de links externos (YouTube, YouTube Music, SoundCloud).
   - **Fila estrita com worker único (concorrência = 1)** executando sob prioridade reduzida no sistema operacional (`nice -n 19`), garantindo que o streaming simultâneo nunca sofra engasgos.
   - Higienização automática de metadados, download de arte de capa e indexação imediata na biblioteca.

5. **Frontend PWA Offline-First:**
   - SPA moderna construída com React 19, TypeScript, Vite e Tailwind CSS.
   - **Zero Node.js em produção:** o build do frontend é 100% embutido no executável estático do Go via `go:embed`.
   - Armazenamento offline real via **IndexedDB** (`offline_tracks`): o áudio é baixado como `Blob` e reproduzido localmente via `URL.createObjectURL` em modo avião ou sem rede.
   - Suporte nativo à **Media Session API** (controles de hardware, fones Bluetooth, tela de bloqueio e relógios inteligentes).

---

## 🏛️ Arquitetura e Estrutura do Código

O projeto segue os princípios de **Clean Architecture**, **Arquitetura Hexagonal (Ports & Adapters)**, **DDD Tático** e estrita adesão aos princípios **SOLID**:

```
harmoni/
├── cmd/
│   └── server/
│       └── main.go                 # Composition Root (Injeção de Dependências e Graceful Shutdown)
├── internal/
│   ├── core/
│   │   ├── domain/                 # Domínio Puro (Zero dependências externas)
│   │   │   ├── library/            # Entidades Track, Album, Artist e Value Objects
│   │   │   ├── radio/              # Matemática de Cosseno e Dynamic Shuffle
│   │   │   └── ingest/             # DownloadJob e State Machine segura
│   │   ├── ports/                  # Interfaces Inbound (Use Cases) e Outbound (ISP)
│   │   └── usecase/                # Orquestração de negócio independente de HTTP/SQL
│   ├── adapters/
│   │   ├── inbound/
│   │   │   ├── http/rest/          # Handlers REST nativos Go 1.26 (/api/v1)
│   │   │   ├── http/subsonic/      # Handlers OpenSubsonic (/rest/*.view)
│   │   │   ├── http/web/           # Servidor estático com go:embed
│   │   │   └── worker/             # Single-Worker Throttled Queue (nice -n 19)
│   │   └── outbound/
│   │       ├── postgres/           # Repositórios com pgxpool e pgvector
│   │       ├── filesystem/         # Leitor seguro (anti-Directory Traversal) e tags ID3
│   │       ├── ytdlp/              # Processo yt-dlp sanitizado
│   │       └── embedding/          # Gerador semântico de embeddings (384 dimensões)
│   └── platform/                   # Config, Logger slog e Migrações SQL embutidas
└── web/                            # Frontend React 19 + TypeScript + PWA
```

---

## 🚀 Como Executar

### 1. Via Docker Compose (Recomendado para Produção / Coolify)

1. Clone o repositório:
   ```bash
   git clone https://github.com/VS-7/Harmoni.git
   cd Harmoni
   ```

2. Crie o arquivo `.env`:
   ```bash
   cp .env.example .env
   ```

3. Inicie os contêineres:
   ```bash
   docker compose up --build -d
   ```

4. Acesse no navegador:
   ```
   http://localhost:8080 (ou a porta configurada no .env)
   ```

### 2. Deploy no Coolify

O repositório já está pronto para deploy no **Coolify**:
1. Conecte o repositório Git no Coolify.
2. Selecione o tipo de build **Docker Compose**.
3. Defina os volumes persistentes mapeados no `docker-compose.yml`:
   - Volume de músicas: `/music`
   - Volume de dados: `/data`
4. Configure as variáveis de ambiente baseadas no `.env.example`.
5. Inicie o deploy!

---

## ⚙️ Variáveis de Ambiente

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `PORT` | `8080` | Porta interna do servidor HTTP |
| `PORT_BIND` | `8080` | Porta exposta no host via Docker Compose |
| `DATABASE_URL` | `postgres://harmoni:harmoni_secret@localhost:5432/harmoni?sslmode=disable` | String de conexão com o PostgreSQL |
| `MUSIC_DIR` | `/music` ou `./music` | Diretório raiz de arquivos de áudio |
| `DATA_DIR` | `/data` ou `./data` | Diretório de persistência temporária e capas |
| `ENV` | `production` | Ambiente (`development` ou `production`) |

---

## 🧪 Testes e Validação

Para executar a suíte completa de testes unitários com o detector de concorrência e o linter estático:

```bash
# Executar todos os testes com detector de race condition
make test
# ou: go test -v -race ./...

# Executar análise estática de código
make vet
# ou: go vet ./...

# Compilar o frontend estático
make build-web

# Compilar o binário estático Go final
make build
```

---

## 📄 Licença

Distribuído sob a licença MIT. Consulte `LICENSE` para obter mais detalhes.
