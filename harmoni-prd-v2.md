# Product Requirements Document (PRD) — v2

**Projeto:** Harmoni
**Escopo:** Descoberta e download integrados + nova UI (Liquid Glass / Apple Music) + PWA mobile
**Versão:** 2.0 (incremental sobre a [v1](harmoni-prd.md))
**Status:** Proposta para revisão
**Data:** 2026-09-17
**Arquitetura:** [harmoni-architecture.md](harmoni-architecture.md)
**Protocolo para Agentes:** [AGENTS.md](AGENTS.md)

---

## 1. Contexto e Problema

Hoje o Módulo 4 (Aquisição de Mídia) só aceita **uma URL colada à mão** e ainda falha no caso de uso mais comum. Diagnóstico do código atual:

| # | Problema | Onde | Causa raiz |
| :--- | :--- | :--- | :--- |
| P1 | Link de playlist do YouTube é rejeitado (ex.: `https://www.youtube.com/watch?v=lBDDMrUCz1A&list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6`) | `internal/core/domain/ingest/job.go` → `ValidateAndSanitizeURL` | `&` está na lista `dangerousChars`. **Toda** URL com mais de um query param é recusada com `ErrUnsafeURL`. Como o comando roda via `exec.CommandContext` (sem shell), o `&` não oferece risco de injeção. |
| P2 | Não dá para pesquisar artistas, músicas ou playlists | — | Não existe porta, caso de uso nem endpoint de busca remota. |
| P3 | O job de playlist pode apontar o arquivo errado | `internal/adapters/outbound/ytdlp/downloader.go` | Depois do download, `filepath.Walk` percorre **todo** o `outputDir` e fica com o *último* `.mp3` que encontrar, que pode ser de outro download. Por isso a criação automática de playlist (`audioDir != outputDir`) nem sempre funciona. |
| P4 | Não há progresso por faixa nem título legível | `download_jobs` / `DownloadsView.tsx` | O job só guarda `source_url` e `status`. A UI mostra a URL crua. |
| P5 | Os botões de ação da lista não funcionam no toque | `TrackList.tsx` | Os botões usam `opacity-0 group-hover:opacity-100`. No celular não existe hover, então as ações ficam invisíveis. |
| P6 | O layout mobile ignora a área segura | `App.tsx`, `BottomPlayer.tsx`, `index.css` | Não usa `env(safe-area-inset-*)`. Com `black-translucent`, o header fica embaixo da status bar e o player fica embaixo do home indicator. |
| P7 | O PWA não instala direito no iOS | `manifest.webmanifest`, `index.html` | O único ícone é SVG e não há `apple-touch-icon` em PNG. |
| P8 | A identidade visual está genérica | Todo o frontend | Botões com gradientes e cores em emerald, sem linguagem visual própria. |

## 2. Objetivos

1. **Descobrir sem sair do app:** pesquisar artistas, músicas e playlists do YouTube / YouTube Music e baixar com um toque.
2. **Aceitar qualquer link válido do YouTube**, inclusive `watch?v=…&list=…`, `youtu.be/…`, `music.youtube.com/…` e `/playlist?list=…`.
3. **Dar visibilidade real à fila:** título, capa e progresso por faixa (`3/12`).
4. **Nova UI inspirada no Apple Music**, com Liquid Glass em todos os controles e Progressive Blur nas bordas de rolagem.
5. **PWA com cara de app nativo** no mobile: tab bar inferior, safe areas, mini player acima da tab bar e sheets de ação.
6. **Menu `…` visível em cada item**, com a opção de baixar no aparelho para ouvir offline.

### Fora de escopo

- Transcoding e mudança do formato de download (continua `mp3`).
- Login ou multiusuário.
- Provedores além de YouTube / YouTube Music (a porta fica extensível, SoundCloud entra depois).
- Qualquer uso de Node.js em produção (RNF2 da v1 continua valendo).

---

## 3. Requisitos Funcionais

### Módulo 6: Resolução de Links (correção do P1 e P3)

* **RF6.1 — Parser de fonte no domínio.**
  * Novo value object `SourceRef{Provider, Kind, ID, PlaylistID}` em `internal/core/domain/ingest/`, criado por `ParseSourceURL(raw string) (SourceRef, error)`. Usa só `net/url` e `strings`, o que respeita o Guardrail 1.
  * **Allowlist de hosts:** `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be`. Qualquer outro host retorna `ErrUnsupportedSource`.
  * **Formatos reconhecidos:**

    | Entrada | Kind |
    | :--- | :--- |
    | `/watch?v=ID` e `youtu.be/ID` | `track` |
    | `/playlist?list=PL…` e `music.youtube.com/playlist?list=OLAK…` | `playlist` |
    | `/watch?v=ID&list=PL…` | `track_in_playlist` (ambíguo, ver RF6.2) |
    | `/@handle`, `/channel/UC…` | `channel` |

  * O `ID` só é aceito se casar com `^[A-Za-z0-9_-]{6,64}$`.
  * **A URL enviada ao `yt-dlp` é sempre remontada a partir do `SourceRef`**, por exemplo `https://www.youtube.com/playlist?list=<ID>`. A string do usuário nunca vai direto ao comando.
  * Remover `&` (e a checagem por lista negra de caracteres) de `ValidateAndSanitizeURL`. A proteção passa a vir da allowlist mais a remontagem canônica.
  * No adapter `ytdlp`, passar `--` antes da URL para impedir *argument injection* (uma URL que comece com `-`).
* **RF6.2 — Link ambíguo (`watch?v=…&list=…`).**
  * `POST /api/v1/downloads/inspect {url}` devolve o `SourceRef` e uma prévia: título, capa e número de itens da playlist.
  * A UI mostra uma sheet com a pergunta **"Baixar só esta música"** ou **"Baixar playlist inteira (N faixas)"**.
  * Mixes automáticos (`list=RD…`) são tratados como `track` por padrão, porque são quase infinitos. Para baixar como playlist, aplicar o limite `--playlist-end 50`.
* **RF6.3 — Caminhos exatos dos arquivos (correção do P3).**
  * O adapter usa `--print after_move:filepath` (e `--print-to-file` quando precisar) para receber **a lista exata** de arquivos gerados, e deixa de varrer o diretório.
  * `DownloaderClient.Download` passa a retornar `[]DownloadedItem{SourceID, AudioPath, CoverPath}`.
  * Usar `--download-archive <DATA_DIR>/ytdlp-archive.txt` para não baixar de novo vídeos que já estão na biblioteca.

### Módulo 7: Descoberta Remota (Busca no YouTube)

* **RF7.1 — Busca unificada.**
  * `GET /api/v1/discover/search?q=<texto>&type=all|track|playlist|artist&limit=20`
  * O adapter padrão é o **`yt-dlp` em modo flat, sem download e sem ffmpeg**:
    * Músicas: `ytsearch20:<q>`
    * Playlists: `https://www.youtube.com/results?search_query=<q>&sp=EgIQAw%3D%3D`
    * Artistas/canais: `https://www.youtube.com/results?search_query=<q>&sp=EgIQAg%3D%3D`
  * A consulta roda com `--flat-playlist --dump-json --no-warnings` e leva `nice -n 19` e timeout de 15 s via `context`.
  * O parâmetro `q` é normalizado (trim, até 120 caracteres, sem caracteres de controle) e vai para `url.QueryEscape`. Nunca é concatenado cru.
  * **Resposta:** `{ id, kind, title, artist, duration_sec, thumbnail_url, item_count, in_library }`.
  * O campo `in_library` vem de `tracks.source_id` (ver seção 5).
* **RF7.2 — Detalhe de playlist remota.**
  * `GET /api/v1/discover/playlists/{id}` devolve os metadados e a lista flat de faixas, com `in_library` por faixa.
* **RF7.3 — Página de artista remoto.**
  * `GET /api/v1/discover/artists/{channelId}` devolve as músicas populares (aba `/videos`, top 20) e os álbuns e playlists (aba `/releases` e `/playlists`).
* **RF7.4 — Cache e limites.**
  * Cache LRU em memória no caso de uso: TTL de 10 min e no máximo 200 entradas, para respeitar o RNF1 (menos de 35 MB).
  * **Execução serializada:** um semáforo de capacidade 1 **separado** do worker de download, para que uma busca (1–3 s) não espere um download de 10 min. **Esta é uma exceção ao Guardrail 4 e precisa de aprovação (ver Q1).**
  * Rate limit simples: no máximo 1 busca por segundo por cliente. O frontend aplica debounce de 400 ms.
* **RF7.5 — Porta extensível.**
  * `ports.RemoteCatalog` (interfaces `RemoteSearcher` e `RemotePlaylistReader`) permite trocar o `yt-dlp` pela **YouTube Data API v3** (opcional, via `YOUTUBE_API_KEY`) sem tocar no caso de uso.
* **RF7.6 — Busca local e remota na mesma tela.**
  * A aba **Buscar** mostra primeiro os resultados da biblioteca local (endpoint `tracks?query=` que já existe) e, abaixo, a seção **"No YouTube"**.

### Módulo 8: Fila de Download 2.0

* **RF8.1 — Download a partir da descoberta.**
  * `POST /api/v1/downloads` passa a aceitar dois formatos:
    * **Legado:** `{ "url": "…", "mode": "track" | "playlist" }`
    * **Novo:** `{ "source": { "provider": "youtube", "kind": "track" | "playlist", "id": "…" } }`
  * `POST /api/v1/downloads/batch { "items": [SourceRef…] }` enfileira várias faixas escolhidas de uma vez (multi-seleção na busca).
* **RF8.2 — Itens de job e progresso.**
  * Um job de playlist é expandido em `download_job_items`, um item por vídeo.
  * O worker processa **item a item**, ainda com 1 worker e `nice -n 19`. Assim o progresso é real, uma falha isolada não derruba a playlist inteira e o cancelamento funciona entre itens.
  * `GET /api/v1/downloads` devolve `title`, `thumbnail_url`, `kind`, `total_items`, `done_items`, `failed_items`.
* **RF8.3 — Ações sobre o job.**
  * `POST /api/v1/downloads/{id}/cancel`
  * `POST /api/v1/downloads/{id}/retry` (tenta de novo só os itens que falharam)
  * `DELETE /api/v1/downloads/{id}` (remove do histórico, sem apagar arquivos)
* **RF8.4 — Playlist automática.**
  * Ao terminar um job `playlist`, criar ou atualizar a playlist Harmoni **pelo `source_playlist_id`**, e não pelo nome da pasta. A ordem segue `playlist_index`.
* **RF8.5 — Atualizações em tempo real.**
  * `GET /api/v1/downloads/events` via **Server-Sent Events** (`text/event-stream`, só `net/http`), substituindo o polling de 3 s.
  * O frontend volta ao polling se o SSE cair.
* **RF8.6 — Higienização de título.**
  * Implementar o RF4.4 da v1, que ainda falta: remover `(Official Video)`, `[4K]`, `(Clipe Oficial)`, `(Lyrics)` e similares antes de gravar as tags.
  * Preferir os campos `artist` e `track` do YouTube Music quando existirem.

### Módulo 9: Nova UI — Design System Liquid Glass

* **RF9.1 — Primitivas de vidro** em `web/src/shared/ui/glass/`:
  * **`<LiquidGlass>`:** implementa o markup e o CSS de referência do Apêndice A, com props `radius`, `strength`, `softness`, `tint` e `as`.
  * **`<GlassButton>`:** tamanhos `sm` (32 px), `md` (44 px) e `lg` (56 px) e variantes `icon`, `label` e `pill`. **Sem cor de fundo sólida.** O conteúdo é branco ou `currentColor`, e o estado ativo usa mais brilho e escala `0.96` ao pressionar.
  * **`<GlassSurface>`:** base de cards, sheets, tab bar, mini player e header.
  * **`<ProgressiveBlur edge="top" | "bottom">`:** implementa o Apêndice B. A variante `bottom` inverte os gradientes (`to top`).
* **RF9.2 — Proibição de cor nos botões.**
  * Remover `bg-emerald-*`, `from-emerald`, `text-emerald-*`, `purple`, `rose` e similares de **todos** os botões e controles.
  * Botões e controles usam **só Liquid Glass**.
  * Estados semânticos (erro, sucesso) aparecem só em texto ou ícone pequeno, nunca como preenchimento de botão.
* **RF9.3 — Tokens.**
  * `index.css` define tokens neutros: `--bg`, `--fg`, `--fg-secondary`, `--separator` e `--glass-*`.
  * O tema é escuro por padrão e o claro segue `prefers-color-scheme`.
  * Tipografia: `-apple-system, "SF Pro Display", system-ui`. Títulos grandes em 34 px/bold, como no Apple Music.
* **RF9.4 — Fundo com arte da capa.**
  * O vidro só aparece com algo colorido atrás dele. Usar a capa da faixa atual (ou do álbum/playlist aberto) como **backdrop desfocado** (`filter: blur(60px) saturate(1.6)`, opacidade de 35 %) atrás do conteúdo, com transição de 600 ms ao trocar de faixa.
* **RF9.5 — Desempenho e acessibilidade do vidro.**
  * **Vidro completo** (7 camadas) só nos elementos flutuantes: header, tab bar, mini player, player expandido, sheets e botões de destaque.
  * **Vidro leve** (1 camada: `backdrop-filter: blur() saturate()` mais a borda `Highlight`) nos botões repetidos dentro de listas, como o `…` de cada linha. Com vidro completo em centenas de linhas, a rolagem trava no celular.
  * Fallback `@supports not (backdrop-filter: blur(1px))`: superfície sólida translúcida (`rgba(30,30,32,.85)`).
  * `@media (prefers-reduced-transparency: reduce)` e `prefers-reduced-motion` desligam o blur e as animações.
  * Adicionar `-webkit-backdrop-filter` em todas as regras, porque o Safari no iOS abaixo da versão 18 exige o prefixo.
  * Contraste mínimo AA (4.5:1) para texto sobre vidro. Usar `text-shadow` sutil quando precisar.

### Módulo 10: Shell Mobile e PWA

* **RF10.1 — Estrutura estilo Apple Music.**

  ```text
  ┌──────────────────────────────┐ ← env(safe-area-inset-top)
  │ ░ Progressive Blur (top) ░   │
  │ Biblioteca          (⋯) (👤)│ ← large title; vira título compacto em GlassSurface ao rolar
  │                              │
  │  conteúdo rolável            │
  │                              │
  │ ░ Progressive Blur (bottom) ░│
  │ ╭──────────────────────────╮ │
  │ │ ▣ Música — Artista  ▶ ⏭ │ │ ← Mini player (GlassSurface, flutuante)
  │ ╰──────────────────────────╯ │
  │ ╭──────────────────────────╮ │
  │ │  ♪      🔍      ⬇      📱 │ │ ← Tab bar (GlassSurface pill)
  │ ╰──────────────────────────╯ │
  └──────────────────────────────┘ ← env(safe-area-inset-bottom)
  ```

  * **Abas:** Biblioteca · Buscar · Downloads · No Aparelho (faixas offline).
  * No desktop (≥ 1024 px), a tab bar vira uma **sidebar** de vidro à esquerda e o player fica na base.
* **RF10.2 — Safe areas e viewport.**
  * Header com `padding-top: env(safe-area-inset-top)`. Tab bar com `padding-bottom: max(env(safe-area-inset-bottom), 8px)`.
  * Altura com `100dvh` (sem `100vh`). O conteúdo ganha `padding-bottom` igual a tab bar + mini player + inset, via variável CSS `--chrome-bottom`.
  * `overscroll-behavior: none` no `body`. Rolagem só no container principal.
  * Alvos de toque de pelo menos 44 × 44 px.
* **RF10.3 — Player expandido.**
  * Tocar no mini player abre a tela cheia (sheet que sobe da base, com swipe-down para fechar) com capa grande, seek, controles em `GlassButton lg`, fila e o botão de rádio.
* **RF10.4 — Navegação com histórico.**
  * A navegação por abas e telas de detalhe usa a History API (`pushState`/`popstate`), sem nova dependência, para que o gesto de voltar do Android e o swipe do iOS funcionem.
  * O estado do player continua no Zustand (RF5.5).
* **RF10.5 — Manifest e ícones.**
  * Ícones PNG 192, 512 e 512 maskable.
  * `apple-touch-icon` 180 px.
  * `id`, `scope`, `display: standalone` e `theme_color`/`background_color` alinhados ao novo `--bg`.
  * `<meta name="theme-color">` com variantes `media` para claro e escuro.
  * Splash (`apple-touch-startup-image`) é opcional.

### Módulo 11: Menu de Ações `…` e Offline

* **RF11.1 — Botão `…` sempre visível.**
  * Cada linha de faixa (biblioteca, playlist, álbum, busca remota) tem um `GlassButton` (vidro leve) com ícone `MoreHorizontal` à direita.
  * O botão **não depende de hover** (correção do P5).
  * A linha inteira continua tocando a faixa ao ser tocada.
  * Long-press na linha abre o mesmo menu.
* **RF11.2 — Conteúdo do menu.**
  * No mobile é uma bottom sheet de vidro; no desktop, um popover.
  * **Faixa local:**
    * ⬇ **Baixar no aparelho** ou ✓ **Remover do aparelho**, com barra de progresso durante o fetch
    * ➕ Adicionar à playlist
    * 📻 Iniciar rádio
    * ⏭ Tocar a seguir
    * ➕ Adicionar à fila
    * 👤 Ir para o artista
    * 💿 Ir para o álbum
    * 🗑 Remover desta playlist (só no contexto de playlist)
  * **Item remoto (busca):**
    * ⬇ Baixar para o servidor
    * 👁 Ver playlist ou artista
    * ↗ Abrir no YouTube
    * Quando o item já está na biblioteca: "Baixar no aparelho", "Tocar"
  * **Álbum e playlist:** ⬇ Baixar tudo no aparelho, que usa uma fila sequencial no cliente e mostra progresso `n/N`.
* **RF11.3 — Indicador offline.**
  * Um ícone pequeno (seta para baixo preenchida, monocromático) ao lado do título mostra quais faixas estão no aparelho.
  * A aba **No Aparelho** lista essas faixas com o espaço usado (`navigator.storage.estimate()`) e a opção de remover.
* **RF11.4 — Progresso do download offline.**
  * `offlineStorage.downloadTrackForOffline` passa a ler o `ReadableStream` com `Content-Length` para informar o progresso e aceita `AbortSignal` para cancelar.

---

## 4. Requisitos Não-Funcionais (adições)

* **RNF5 — Memória.** O cache de busca e a lógica de SSE não podem levar o backend acima de 35 MB em repouso. Os processos `yt-dlp` rodam fora do heap do Go.
* **RNF6 — Latência de busca.** p50 abaixo de 2,5 s sem cache e abaixo de 50 ms com cache.
* **RNF7 — Fluidez.** A rolagem das listas deve ficar em 60 fps num aparelho médio (iPhone 12 / Pixel 6). Nas listas longas, aplicar `content-visibility: auto` nas linhas.
* **RNF8 — Segurança.**
  * Allowlist de hosts, IDs validados por regex, URL canônica remontada, `--` antes dos argumentos posicionais e nenhum shell.
  * O erro devolvido pelo handler não pode vazar a saída bruta do `yt-dlp`. Hoje `download_handler.go` concatena `err.Error()` num JSON montado à mão; trocar por `json.NewEncoder`.
* **RNF9 — Resiliência a mudanças do YouTube.** O `yt-dlp` precisa ficar atualizável sem rebuild. Opcional: `yt-dlp -U` agendado, ou endpoint admin `POST /api/v1/admin/ytdlp/update`.

---

## 5. Mudanças de Dados (migration `003_discovery_and_job_items.sql`)

```sql
ALTER TABLE tracks
    ADD COLUMN IF NOT EXISTS source_provider VARCHAR(16),
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_source
    ON tracks(source_provider, source_id) WHERE source_id IS NOT NULL;

ALTER TABLE download_jobs
    ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'track',   -- track | playlist
    ADD COLUMN IF NOT EXISTS source_provider VARCHAR(16),
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS title VARCHAR(512),
    ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(1024),
    ADD COLUMN IF NOT EXISTS playlist_id UUID REFERENCES playlists(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS download_job_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES download_jobs(id) ON DELETE CASCADE,
    position INT NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    title VARCHAR(512),
    status VARCHAR(32) NOT NULL DEFAULT 'queued', -- queued | processing | completed | failed | skipped | canceled
    track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
    error_message TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (job_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_job_items_job ON download_job_items(job_id, position);
```

* **Backfill de `tracks.source_id`:** o scanner extrai o ID do padrão `[<id>]` que já existe nos nomes de arquivo gerados pelo template atual.
* **Novo status:** `canceled` entra em `ingest.JobStatus`, com as transições validadas no domínio.

---

## 6. Mapa de Implementação (segue o checklist do AGENTS.md)

| Passo | Arquivos |
| :--- | :--- |
| 1. Domínio | `ingest/source_ref.go` (+ testes com tabela de URLs, incluindo o link do P1), `ingest/job.go` (kind, itens, cancel), `discovery/remote_item.go`, `ingest/title_cleaner.go` |
| 2. Portas | `RemoteSearcher`, `RemotePlaylistReader`, `RemoteArtistReader`, `DownloadJobItemRepository`, `DiscoveryUseCase`; `DownloaderClient.Download` retorna `[]DownloadedItem` |
| 3. Casos de uso | `usecase/discovery_service.go` (cache LRU + semáforo), `usecase/media_ingest.go` (inspect, batch, cancel, retry) |
| 4. Adapters de saída | `ytdlp/searcher.go`, `ytdlp/downloader.go` (URL canônica, `--`, `--print`, archive), `postgres/download_job_item_repository.go`, migration 003 |
| 5. Adapters de entrada | `rest/discover_handler.go`, `rest/download_handler.go` (inspect, batch, cancel, retry, SSE) |
| 6. Composition root | `cmd/server/main.go` |
| 7. Frontend | `shared/ui/glass/*`, `app/shell/{TabBar,LargeTitleHeader,MiniPlayer,NowPlayingSheet}.tsx`, `features/discover/*` (`useDiscoverSearch`), `features/downloads/*` (`useDownloadEvents`), `shared/ui/ActionSheet.tsx`, `features/library/components/TrackActionsMenu.tsx`, `features/offline/*` |
| 8. Testes | parser de URL, title cleaner, transições de job, discovery service com mocks das portas, handler de inspect |

---

## 7. Fases de Entrega

| Fase | Entrega | Critério de pronto |
| :--- | :--- | :--- |
| **F0 — Hotfix** | RF6.1 (parser e remoção do `&`) e RF6.3 (caminhos exatos) | O link do P1 baixa a playlist inteira e cria a playlist Harmoni correta |
| **F1 — Backend de descoberta** | Módulo 7, RF8.1–8.4, migration 003 | `curl /api/v1/discover/search?q=...` devolve músicas, playlists e artistas |
| **F2 — Design system e shell** | Módulos 9 e 10 | App instalado no iPhone/Android sem sobreposição com o notch ou o home indicator; nenhum botão colorido |
| **F3 — Telas novas** | Aba Buscar, Downloads 2.0, menu `…` (Módulo 11), RF8.5 (SSE) | Fluxo "buscar artista → abrir playlist → baixar → ouvir offline" completo no celular |
| **F4 — Polimento** | RF9.4 (backdrop de capa), RF8.6, reduced-transparency, ícones PNG | Checklist de acessibilidade e 60 fps no perfil de desempenho |

---

## 8. Critérios de Aceite

- [ ] `https://www.youtube.com/watch?v=lBDDMrUCz1A&list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6` é aceito, e a UI pergunta se deve baixar só a faixa ou a playlist.
- [ ] URLs de hosts fora da allowlist ou com ID inválido são recusadas com erro claro.
- [ ] Buscar "Legião Urbana" mostra músicas, playlists e o canal do artista, com indicação de "já na biblioteca".
- [ ] Uma playlist de 20 faixas mostra progresso `n/20` em tempo real, e uma faixa indisponível não faz o job inteiro falhar.
- [ ] Nenhum botão da UI usa cor sólida ou gradiente. Todos usam Liquid Glass.
- [ ] O header e a tab bar respeitam as safe areas no iPhone com Dynamic Island e no Android com gesture bar, no modo standalone.
- [ ] O botão `…` aparece em todas as linhas no toque e permite baixar a faixa no aparelho. A faixa toca em modo avião.
- [ ] O backend fica abaixo de 35 MB em repouso depois de 50 buscas.
- [ ] `go test -race ./...`, `go vet ./...` e `npm run build` passam.

---

## 9. Questões em Aberto

| # | Questão | Recomendação |
| :--- | :--- | :--- |
| Q1 | A busca chama o `yt-dlp` fora do worker único (exceção ao Guardrail 4)? | **Sim**, com semáforo próprio de capacidade 1, `nice -n 19`, timeout de 15 s e cache. Busca flat é leve e não usa ffmpeg. Atualizar o Guardrail 4 no AGENTS.md para "downloads e conversões" |
| Q2 | Usar a YouTube Data API como fonte principal? | Não. Fica como adapter opcional por `YOUTUBE_API_KEY` (cota de 10k/dia). O `yt-dlp` já está na imagem e não exige chave |
| Q3 | Quais abas entram na tab bar? | Biblioteca · Buscar · Downloads · No Aparelho |
| Q4 | Tema claro também? | Sim, via `prefers-color-scheme`. O vidro funciona nos dois |
| Q5 | Formato de áudio | Manter `mp3` por compatibilidade. Avaliar `m4a`/`opus` (sem reconversão, menor custo de CPU) numa v3 |

---

## Apêndice A — Liquid Glass (CSS de referência)

Markup base (encapsulado em `<LiquidGlass>`):

```html
<div class="GlassContainer">
  <div class="GlassContent"><!-- conteúdo --></div>
  <div class="GlassMaterial">
    <div class="GlassEdgeReflection"></div>
    <div class="GlassEmbossReflection"></div>
    <div class="GlassRefraction"></div>
    <div class="GlassBlur"></div>
    <div class="BlendLayers"></div>
    <div class="BlendEdge"></div>
    <div class="Highlight"></div>
  </div>
</div>
```

```css
.GlassContainer {
    --corner-radius: 24px;
    --base-strength: 14px;
    --extra-blur: 2px;
    --softness: 12px;
    --tint-amount: 0;
    --tint-saturation: 2;
    --tint-hue: 180deg;
    --contrast: 1;
    --brightness: 1;
    --invert: 10%;

    --total-strength: calc(var(--base-strength) + var(--extra-blur));
    --edge-width: calc(0.3px + (var(--softness) * 0.1));
    --emboss-width: calc((var(--softness) * 0.38));
    --refraction-width: calc((var(--softness) * 0.3));

    position: relative;
    overflow: visible;
    pointer-events: none;
}
.GlassContent {
    position: relative;
    display: block;
    z-index: 100;
    overflow: hidden;
    border-radius: var(--corner-radius);
    pointer-events: auto;
}
.GlassMaterial {
    position: absolute;
    inset: 0;
    z-index: 1;
    overflow: visible;
    pointer-events: none;
}
.GlassMaterial:after {
    content: '';
    display: block;
    position: absolute;
    inset: 0;
    z-index: 3;
    overflow: hidden;
    border-radius: var(--corner-radius);
    background-color: rgba(128, 128, 128, 0);
}
.GlassMaterial > div {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    border-radius: var(--corner-radius);
    z-index: 2;
    overflow: hidden;
}
.GlassMaterial .GlassEdgeReflection {
    z-index: 4;
    margin: calc(var(--total-strength) * -1);
    border-radius: calc(var(--corner-radius) + var(--total-strength));
    backdrop-filter: blur(var(--total-strength)) brightness(1.2) saturate(1.2);
    padding: var(--edge-width);
    border: var(--total-strength) solid transparent;
    mask:
        linear-gradient(white 0 0) padding-box,
        linear-gradient(white 0 0) content-box;
    mask-composite: exclude, exclude;
}
.GlassMaterial .GlassEmbossReflection {
    backdrop-filter: blur(calc(var(--total-strength) * 1.5)) invert(0.25) brightness(1.11) saturate(1.2) hue-rotate(-10deg) contrast(2.3);
    padding: var(--emboss-width);
    border: 0 solid transparent;
    mask:
        linear-gradient(white 0 0) padding-box,
        linear-gradient(white 0 0) content-box;
    mask-composite: exclude, exclude;
}
.GlassMaterial .GlassRefraction {
    backdrop-filter: invert(0.1) brightness(1.2) contrast(1.5);
    padding: var(--refraction-width);
    border: calc(var(--emboss-width)) solid transparent;
    mask:
        linear-gradient(white 0 0) padding-box,
        linear-gradient(white 0 0) content-box;
    mask-composite: exclude, exclude;
}
.GlassMaterial .GlassBlur {
    backdrop-filter: blur(var(--extra-blur)) brightness(1.25);
    border-radius: calc(var(--corner-radius) - (var(--emboss-width) + var(--refraction-width)));
    margin: calc(var(--emboss-width) + var(--refraction-width));
}
.GlassMaterial .BlendLayers {
    z-index: 3;
    backdrop-filter: blur(calc((var(--softness) * 0.2) + (var(--extra-blur) * 0.2)));
}
.GlassMaterial .BlendEdge {
    z-index: 8;
    backdrop-filter: blur(calc(var(--edge-width) * 0.4)) contrast(1.6) saturate(1.5);
}
.GlassContainer:before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 20;
    display: block;
    border-radius: var(--corner-radius);
    backdrop-filter: invert(var(--invert));
}
.GlassMaterial:before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 11;
    display: block;
    border-radius: var(--corner-radius);
    padding: 1px;
    border: 0 solid transparent;
    background: linear-gradient(155deg, hsla(0, 0%, 100%, 0.15) 0%, hsla(0, 0%, 0%, 0.2) 50%, hsla(0, 0%, 100%, 0.15) 100%);
    backdrop-filter: invert(0.15) opacity(1);
    mask:
        linear-gradient(white 0 0) padding-box,
        linear-gradient(white 0 0) content-box;
    mask-composite: exclude, exclude;
}
.GlassMaterial .Highlight {
    z-index: 12;
    display: block;
    border-radius: var(--corner-radius);
    padding: 1px;
    border: 0 solid transparent;
    backdrop-filter: brightness(1.2) contrast(1.6) saturate(1.2) opacity(1);
    mask:
        linear-gradient(white 0 0) padding-box,
        linear-gradient(white 0 0) content-box;
    mask-composite: exclude, exclude;
}
```

**Ajustes obrigatórios na implementação:**

* Duplicar cada `backdrop-filter` com `-webkit-backdrop-filter`, necessário no iOS abaixo da versão 18.
* Duplicar `mask` com `-webkit-mask` e `-webkit-mask-composite: xor`.
* Definir as variáveis por tamanho: `sm` com `--corner-radius: 16px; --base-strength: 8px`, `pill` com `--corner-radius: 999px`.
* A variante "leve" (RF9.5) usa só `.GlassBlur` e `.Highlight`.

## Apêndice B — Progressive Blur (CSS de referência)

```html
<!-- dentro do elemento que recebe o efeito -->
<div class="progressive-blur">
    <div></div><div></div><div></div><div></div><div></div><div></div><div></div>
</div>
```

```css
.progressive-blur {
    --blur-strength: 16px;
    height: 80px;
    z-index: -1;
    position: absolute;
    pointer-events: none;
    top: 0;
    bottom: auto;
    left: 0;
    right: 0;
}
.progressive-blur > div { position: absolute; inset: 0; }
.progressive-blur > div:nth-child(1) { z-index: 7; backdrop-filter: blur(calc(var(--blur-strength) / 64)); mask: linear-gradient(to bottom, rgba(0,0,0,1) 95%, rgba(0,0,0,0) 100%); }
.progressive-blur > div:nth-child(2) { z-index: 6; backdrop-filter: blur(calc(var(--blur-strength) / 32)); mask: linear-gradient(to bottom, rgba(0,0,0,1) 90%, rgba(0,0,0,0) 95%); }
.progressive-blur > div:nth-child(3) { z-index: 5; backdrop-filter: blur(calc(var(--blur-strength) / 16)); mask: linear-gradient(to bottom, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%); }
.progressive-blur > div:nth-child(4) { z-index: 4; backdrop-filter: blur(calc(var(--blur-strength) / 8));  mask: linear-gradient(to bottom, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 80%); }
.progressive-blur > div:nth-child(5) { z-index: 3; backdrop-filter: blur(calc(var(--blur-strength) / 4));  mask: linear-gradient(to bottom, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 60%); }
.progressive-blur > div:nth-child(6) { z-index: 2; backdrop-filter: blur(calc(var(--blur-strength) / 2));  mask: linear-gradient(to bottom, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 40%); }
.progressive-blur > div:nth-child(7) { z-index: 1; backdrop-filter: blur(var(--blur-strength));            mask: linear-gradient(to bottom, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 20%); }
```

**Uso:**

* **Topo:** atrás do header, com `height` igual à altura do header mais `env(safe-area-inset-top)` mais 24 px.
* **Base:** `.progressive-blur--bottom`, com `top: auto; bottom: 0` e todos os gradientes em `to top`, atrás da tab bar e do mini player.
* Aplicar os mesmos prefixos `-webkit-` do Apêndice A.
