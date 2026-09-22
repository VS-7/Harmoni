package web

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed dist/*
var distFS embed.FS

type EmbedHandler struct {
	fileServer http.Handler
	subFS      fs.FS
}

func NewEmbedHandler() *EmbedHandler {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	return &EmbedHandler{
		fileServer: http.FileServer(http.FS(sub)),
		subFS:      sub,
	}
}

func (h *EmbedHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}

	// Check if file physically exists in embedded FS
	f, err := h.subFS.Open(path)
	if err == nil {
		_ = f.Close()
		// Go não conhece .webmanifest; sem o tipo certo alguns navegadores ignoram o
		// manifesto e o app deixa de ser instalável (RF10.5).
		if strings.HasSuffix(path, ".webmanifest") {
			w.Header().Set("Content-Type", "application/manifest+json")
		}
		// A fonte da UI vem empacotada no build; a tabela MIME embutida do Go não
		// conhece .woff2 e a imagem Alpine não tem /etc/mime.types.
		if strings.HasSuffix(path, ".woff2") {
			w.Header().Set("Content-Type", "font/woff2")
		}
		h.fileServer.ServeHTTP(w, r)
		return
	}

	// SPA fallback: serve index.html for unknown non-asset paths
	indexFile, err := h.subFS.Open("index.html")
	if err == nil {
		defer indexFile.Close()
		if rs, ok := indexFile.(io.ReadSeeker); ok {
			stat, _ := indexFile.Stat()
			http.ServeContent(w, r, "index.html", stat.ModTime(), rs)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.Copy(w, indexFile)
		return
	}

	http.NotFound(w, r)
}
