# Product Requirements Document (PRD)

**Projeto:** Servidor de Áudio Self-Hosted Inteligente  
**Codinome:** *Harmoni*  
**Versão:** 1.0 (Especificação Funcional e Arquitetura)  
**Status:** Pronto para Desenvolvimento  
**Arquitetura:** [harmoni-architecture.md](file:///home/vitor/workspace/projetos/go/harmoni/harmoni-architecture.md)  
**Protocolo para Agentes:** [AGENTS.md](file:///home/vitor/workspace/projetos/go/harmoni/AGENTS.md)  


---

## 1. Visão Geral e Objetivos

O **Harmoni** é um servidor de streaming de música self-hosted, focado em baixo consumo de recursos (voltado para hardware modesto como VPS de 512 MB a 1 GB de RAM), que reúne três capacidades essenciais:
1. **Streaming e Gerenciamento Pessoal:** Reprodução direta de arquivos locais sem dependência de serviços em nuvem.
2. **Compatibilidade Ampla:** Suporte simultâneo a um frontend PWA nativo (com reprodução offline real) e clientes de terceiros via **API OpenSubsonic**.
3. **Descoberta Inteligente e Aquisição:** Motor de recomendação local (estilo rádio do Spotify) acoplado a um módulo assíncrono para baixar e catalogar músicas a partir de URLs externas (YouTube).

---

## 2. Stack Tecnológico e Diretrizes de Engenharia

| Camada | Tecnologia | Justificativa |
| :--- | :--- | :--- |
| **Backend** | Go 1.26+ (`net/http` puro) | Zero dependência de frameworks externos, roteamento nativo eficiente, novos recursos de concorrência/compilação, baixo footprint de memória (< 25 MB RAM). |
| **Database** | PostgreSQL 16+/17+ com `pgvector` | Suporte robusto a dados relacionais clássicos (ACID) e indexação vetorial HNSW/IVFFlat no mesmo banco. |
| **Frontend** | React / TypeScript / Vite | Compilação em Single Page Application (SPA) 100% estática. |
| **Empacotamento Web** | `go:embed` | O build do frontend é embutido no binário do Go. **Zero uso de Node.js em produção.** |
| **Media Ingest** | `yt-dlp` + `ffmpeg` | Utilitários de linha de comando orquestrados pelo Go apenas no momento do download. |
| **Armazenamento Offline** | IndexedDB + Cache Storage API | Permite armazenamento de áudio cru (`Blob`) no cliente sem necessidade de lojas de aplicativos. |

---

## 3. Requisitos Funcionais Detalhados

### Módulo 1: Core de Streaming e Sistema de Arquivos

*   **RF1.1 - Scanner de Biblioteca Local:**
    *   Varredura recursiva de diretórios configurados no disco.
    *   Extração automática de metadados ID3/Vorbis Comments (Título, Artista, Álbum, Ano, Faixa, Gênero, Duração) e capa embutida.
    *   Detecção de alterações (novos arquivos, modificações, exclusões) sem recarregar toda a base.
*   **RF1.2 - Streaming com Suporte a Range Requests (Seek):**
    *   Servir arquivos via `http.ServeContent` para responder nativamente a cabeçalhos `Range: bytes=X-Y` com código HTTP `206 Partial Content`.
    *   **Diretriz de Performance:** *Zero transcoding em tempo real*. Enviar o arquivo no formato original (`MP3`, `AAC`, `FLAC`, `Opus`) diretamente ao cliente.
*   **RF1.3 - Serviço de Capas (Cover Art):**
    *   Extrair e servir a imagem da capa da própria faixa ou de arquivos locais (`cover.jpg`, `folder.png`).
    *   Cache de cabeçalhos HTTP (`Cache-Control: public, max-age=31536000`) para evitar leituras repetidas em disco.

---

### Módulo 2: Compatibilidade com OpenSubsonic API

Permite que clientes consolidados (ex: Symfonium no Android, Ample no iOS, Feishin no Desktop) conectem ao servidor sem configuração adicional.

*   **RF2.1 - Autenticação Subsonic:**
    *   Implementação de autenticação via Token e Salt (MD5 hashing de senha + salt), conforme padrão Subsonic v1.16.1+.
*   **RF2.2 - Endpoints Essenciais de Navegação:**
    *   `ping.view`: Teste de conectividade e versão da API.
    *   `getArtists.view` e `getArtist.view`: Listagem de artistas em formato XML/JSON.
    *   `getAlbum.view`: Detalhes e faixas de um álbum.
    *   `getSong.view`: Metadados de uma faixa específica.
*   **RF2.3 - Endpoints de Reprodução:**
    *   `stream.view`: Endpoint mapeado para o motor de streaming nativo.
    *   `download.view`: Download direto do arquivo para armazenamento offline nos clientes Subsonic.
*   **RF2.4 - Ganchos para o Motor de Inteligência:**
    *   Interceptação do endpoint `getSimilarSongs.view` para alimentar a resposta com os dados calculados pelo módulo de recomendação vetorial do sistema.

---

### Módulo 3: Motor de Recomendação e Rádio Inteligente (Smart Brain)

*   **RF3.1 - Enriquecimento e Geração de Vetores:**
    *   Ao indexar uma faixa, o sistema monta um vetor descritivo consolidando metadados (gênero, artista, BPM aproximado, ano de lançamento e humor/tags musicais).
    *   Geração de embeddings normalizados via chamada leve externa (ex: API de embeddings ou modelo ultraleve em Go) gerando vetores de dimensão compacta (ex: 384 dimensões).
    *   Persistência do vetor na coluna `embedding` do tipo `vector` no PostgreSQL.
*   **RF3.2 - Algoritmo de "Rádio da Faixa" (Song Radio):**
    *   Recebe o ID de uma música base.
    *   Executa busca de vizinhança mais próxima por distância de cosseno no PostgreSQL:
        *   Busca as $N$ faixas mais similares com distância $< \text{threshold}$.
    *   **Mecanismo Anti-Repetição (Dynamic Shuffle):**
        *   Não selecionar deterministicamente as top faixas na ordem exata.
        *   Aplicar penalidade temporária para faixas do mesmo artista.
        *   Filtrar faixas presentes no histórico de reprodução recente da sessão ativa.
*   **RF3.3 - Fila Contínua (Autoplay Infinito):**
    *   Quando a fila do usuário estiver a 2 faixas do fim, o cliente dispara automaticamente a geração de novas faixas similares, garantindo reprodução ininterrupta.

---

### Módulo 4: Aquisição de Mídia (Downloader Integrado)

*   **RF4.1 - Ingestão por Link Externo:**
    *   Endpoint dedicado (`POST /api/v1/downloads`) que aceita URLs externas (YouTube, YouTube Music, Soundcloud).
*   **RF4.2 - Fila de Processamento Estrita (Single-Worker):**
    *   Uso de canais em Go (`chan DownloadJob`) limitados a **1 processo concorrente** por vez.
    *   Downloads subsequentes entram em estado de espera (`queued`).
*   **RF4.3 - Execução Throttled com Baixo Impacto:**
    *   Invocação do `yt-dlp` com prioridade de processo reduzida no sistema operacional (`nice -n 19` em ambientes Unix) para que o streaming de áudio nunca sofra engasgos.
    *   Extração automática da faixa de áudio em formato estável (`mp3` ou `m4a`) e download da capa em alta resolução.
*   **RF4.4 - Higienização de Metadados e Indexação:**
    *   Tratamento do título retornado (remoção de strings como *"Official Music Video"*, *"(Clip Oficial)"*, *"[4K]"*).
    *   Preenchimento automático das tags ID3 no arquivo recém-gerado.
    *   Inserção imediata no PostgreSQL e disparo assíncrono para o motor vetorial.

---

### Módulo 5: Frontend PWA (Web & Mobile Offline)

*   **RF5.1 - Progressive Web App Instalável:**
    *   Suporte a Web App Manifest com configurações `standalone`, orientação retrato/paisagem e ícones adaptativos para Android e iOS.
    *   Service Worker responsável por cachear 100% dos assets estáticos (HTML, JS, CSS, fontes e ícones).
*   **RF5.2 - Sistema de Download e Armazenamento Offline:**
    *   Botão "Baixar para Offline" disponível em faixas, álbuns e playlists.
    *   O cliente faz o fetch da faixa como `Blob` binário e armazena em uma tabela de objetos no **IndexedDB** local do dispositivo.
    *   Solicitação ativa de persistência de disco via `navigator.storage.persist()` para evitar limpeza automática pelo Safari/Chrome sob pressão de armazenamento.
*   **RF5.3 - Interceptação e Player Híbrido (Online/Offline):**
    *   Camada intermediária no player de áudio:
        *   Verifica se a faixa existe no IndexedDB local.
        *   Se existir: cria uma URL local (`URL.createObjectURL(blob)`) e executa o áudio localmente sem tocar na rede.
        *   Se não existir: consome a rota `/api/stream/{id}` via rede tradicional.
*   **RF5.4 - Controles no Sistema Operacional (Media Session API):**
    *   Integração nativa com a API `navigator.mediaSession`.
    *   Exibição em tela de bloqueio e central de controle: Título, Artista, Álbum e Arte da Capa.
    *   Tratamento de eventos de botões físicos/bluetooth: *Play*, *Pause*, *NextTrack*, *PreviousTrack*, *SeekBackward*, *SeekForward*.
*   **RF5.5 - Player Global e Persistente:**
    *   O estado da reprodução e a fila de músicas vivem fora do ciclo de vida das páginas/rotas da interface, permitindo que o usuário explore a biblioteca, adicione links de download ou gerencie playlists sem interromper a música.

---

## 4. Requisitos Não-Funcionais

*   **RNF1 - Pegada de Memória (RAM):**
    *   O binário Go em execução deve manter consumo entre 15 MB e 35 MB de RAM em repouso.
    *   O PostgreSQL deve operar com limites estritos de buffer, mantendo o consumo total do sistema (Go + Postgres) abaixo de **150 MB de RAM**.
*   **RNF2 - Ausência de Runtime Node.js:**
    *   Nenhum processo Node.js deve existir no ambiente de execução/produção. Todo o frontend deve ser servido como arquivos estáticos a partir do próprio executável Go compilado.
*   **RNF3 - Latência de Início de Reprodução:**
    *   O tempo para o início do áudio (*Time-To-First-Audio*) em conexões locais deve ser inferior a **200 ms**, graças ao uso de `http.ServeContent` sem etapas intermediárias de decodificação no servidor.
*   **RNF4 - Segurança e Isolamento:**
    *   Sanitização estrita de URLs recebidas para download contra ataques de Command Injection.
    *   Restrição de caminhos de arquivos para evitar ataques de *Directory Traversal* na leitura de músicas.

---

## 5. Estrutura de Dados Preliminar (PostgreSQL)

```sql
-- Habilita extensão vetorial
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela de Artistas
CREATE TABLE artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Álbuns
CREATE TABLE albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    year INT,
    cover_path VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Faixas
CREATE TABLE tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID REFERENCES albums(id) ON DELETE SET NULL,
    artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    track_number INT,
    duration INT NOT NULL, -- segundos
    file_path VARCHAR(1024) NOT NULL UNIQUE,
    file_format VARCHAR(16) NOT NULL, -- mp3, flac, m4a, opus
    file_size BIGINT NOT NULL,
    bitrate INT,
    genre VARCHAR(128),
    embedding vector(384), -- Vetor para o rádio inteligente
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice vetorial com pgvector (Cosine distance)
CREATE INDEX ON tracks USING hnsw (embedding vector_cosine_ops);

-- Tabela de Fila de Downloads
CREATE TABLE download_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url VARCHAR(1024) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


---

## 6. Fluxos Críticos de Usuário

### Fluxo A: Ingestão de Link Externo (YouTube → Servidor)

1. O usuário cola o link no PWA e clica em **"Baixar"**.
2. O PWA envia uma requisição `POST /api/v1/downloads` para o backend Go.
3. O Go insere o registro na tabela `download_jobs` com status `queued` e coloca o job no canal interno de execução.
4. O worker em Go processa o item com `yt-dlp` sob comando `nice -n 19`.
5. Ao concluir, o arquivo de áudio e a arte de capa são salvos no diretório oficial de mídia.
6. O scanner é acionado para ler as tags ID3/metadados, inserir a faixa na tabela `tracks` e gerar o vetor no `pgvector`.
7. O status do job passa para `completed` e o frontend atualiza o status via polling ou evento.

### Fluxo B: Download para Reprodução Offline no Mobile

1. O usuário acessa um álbum no PWA instalado no smartphone e clica em **"Tornar Disponível Offline"**.
2. A aplicação itera sobre as faixas do álbum e requisita os binários via `GET /api/stream/{id}`.
3. Cada resposta HTTP é convertida para `Blob` no cliente e gravada no **IndexedDB** sob a store `offline_tracks`.
4. Uma chave local (`is_offline = true`) indica que a faixa está pronta para execução offline.
5. Em caso de perda de conexão (modo avião), o player consome diretamente o `IndexedDB` sem erros de requisição de rede.

### Fluxo C: Rádio Contínuo da Música

1. O usuário clica com o botão direito ou no menu de contexto de uma faixa e seleciona **"Iniciar Rádio"**.
2. O PWA envia `GET /api/v1/radio?seed_track_id={id}&limit=20`.
3. O Go executa a consulta no PostgreSQL buscando os registros com menor distância cosseno do vetor da música base, aplicando desempates e regras de penalização de artista repetido.
4. As 20 faixas retornadas substituem a fila atual e a primeira faixa começa a tocar imediatamente.
5. Ao aproximar-se do final da fila (ex: 2 músicas restantes), o frontend solicita o próximo lote de recomendações baseado na última faixa reproduzida.

---

## 7. Critérios de Conclusão do MVP

O produto será considerado pronto para uso diário quando:

- [ ] O binário Go iniciar em menos de 1 segundo e expor as rotas HTTP sem dependência externa além do PostgreSQL.
- [ ] Uma pasta de músicas locais for escaneada e reproduzível com seek (`Range` request / HTTP 206) funcional no navegador.
- [ ] O cliente móvel Symfonium conectar com sucesso via protocolo OpenSubsonic.
- [ ] O PWA permitir instalação no celular, execução em segundo plano com a tela bloqueada (Media Session API) e reprodução de faixas em modo avião via IndexedDB.
- [ ] Um link do YouTube enviado via interface for baixado, indexado e adicionado à biblioteca sem travamentos no streaming simultâneo.
- [ ] A funcionalidade "Iniciar Rádio" devolver faixas com harmonia e gênero coerentes a partir de uma faixa inicial.
