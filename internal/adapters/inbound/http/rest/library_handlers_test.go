package rest

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/domain/playlist"
	"harmoni/internal/core/ports"
)

// stubFolders implements ports.PlaylistFolderUseCase with an in-memory folder list.
type stubFolders struct {
	folders map[playlist.FolderID]*playlist.Folder
	moved   map[playlist.PlaylistID]*playlist.FolderID
}

func newStubFolders() *stubFolders {
	return &stubFolders{
		folders: map[playlist.FolderID]*playlist.Folder{},
		moved:   map[playlist.PlaylistID]*playlist.FolderID{},
	}
}

func (s *stubFolders) CreateFolder(ctx context.Context, name string) (*playlist.Folder, error) {
	f, err := playlist.NewFolder("f-new", name)
	if err != nil {
		return nil, err
	}
	s.folders[f.ID] = f
	return f, nil
}

func (s *stubFolders) ListFolders(ctx context.Context) ([]*playlist.Folder, error) {
	list := make([]*playlist.Folder, 0, len(s.folders))
	for _, f := range s.folders {
		list = append(list, f)
	}
	return list, nil
}

func (s *stubFolders) RenameFolder(ctx context.Context, id playlist.FolderID, name string) (*playlist.Folder, error) {
	f, ok := s.folders[id]
	if !ok {
		return nil, playlist.ErrFolderNotFound
	}
	if err := f.Rename(name); err != nil {
		return nil, err
	}
	return f, nil
}

func (s *stubFolders) DeleteFolder(ctx context.Context, id playlist.FolderID) error {
	if _, ok := s.folders[id]; !ok {
		return playlist.ErrFolderNotFound
	}
	delete(s.folders, id)
	return nil
}

func (s *stubFolders) MovePlaylist(ctx context.Context, playlistID playlist.PlaylistID, folderID *playlist.FolderID) error {
	if folderID != nil {
		if _, ok := s.folders[*folderID]; !ok {
			return playlist.ErrFolderNotFound
		}
	}
	s.moved[playlistID] = folderID
	return nil
}

func newFolderMux(uc ports.PlaylistFolderUseCase) *http.ServeMux {
	h := NewPlaylistFolderHandler(uc)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/playlist-folders", h.ListFolders)
	mux.HandleFunc("POST /api/v1/playlist-folders", h.CreateFolder)
	mux.HandleFunc("PATCH /api/v1/playlist-folders/{id}", h.RenameFolder)
	mux.HandleFunc("DELETE /api/v1/playlist-folders/{id}", h.DeleteFolder)
	mux.HandleFunc("PUT /api/v1/playlists/{id}/folder", h.MovePlaylist)
	return mux
}

func do(t *testing.T, mux http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(method, path, reader))
	return rec
}

func TestFolderHandler_CRUD(t *testing.T) {
	uc := newStubFolders()
	mux := newFolderMux(uc)

	rec := do(t, mux, http.MethodPost, "/api/v1/playlist-folders", `{"name":"  Academia "}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("POST esperava 201, obteve %d: %s", rec.Code, rec.Body)
	}
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	if created["id"] != "f-new" || created["name"] != "Academia" {
		t.Fatalf("pasta criada com JSON inesperado: %v", created)
	}

	rec = do(t, mux, http.MethodGet, "/api/v1/playlist-folders", "")
	var list struct {
		Data  []map[string]any `json:"data"`
		Total int              `json:"total"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != http.StatusOK || list.Total != 1 || list.Data[0]["name"] != "Academia" {
		t.Fatalf("listagem inesperada (%d): %s", rec.Code, rec.Body)
	}

	rec = do(t, mux, http.MethodPatch, "/api/v1/playlist-folders/f-new", `{"name":"Treino"}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"Treino"`) {
		t.Fatalf("PATCH esperava 200 com o novo nome, obteve %d: %s", rec.Code, rec.Body)
	}

	rec = do(t, mux, http.MethodDelete, "/api/v1/playlist-folders/f-new", "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("DELETE esperava 204, obteve %d", rec.Code)
	}
	rec = do(t, mux, http.MethodDelete, "/api/v1/playlist-folders/f-new", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("DELETE repetido esperava 404, obteve %d", rec.Code)
	}
}

func TestFolderHandler_Validation(t *testing.T) {
	mux := newFolderMux(newStubFolders())

	cases := []struct {
		name, method, path, body string
		want                     int
	}{
		{"nome vazio", http.MethodPost, "/api/v1/playlist-folders", `{"name":"  "}`, http.StatusBadRequest},
		{"json inválido", http.MethodPost, "/api/v1/playlist-folders", `{`, http.StatusBadRequest},
		{"nome longo", http.MethodPost, "/api/v1/playlist-folders", `{"name":"` + strings.Repeat("x", 256) + `"}`, http.StatusBadRequest},
		{"renomear inexistente", http.MethodPatch, "/api/v1/playlist-folders/nada", `{"name":"X"}`, http.StatusNotFound},
		{"mover para pasta inexistente", http.MethodPut, "/api/v1/playlists/pl-1/folder", `{"folderId":"nada"}`, http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := do(t, mux, tc.method, tc.path, tc.body)
			if rec.Code != tc.want {
				t.Fatalf("esperava %d, obteve %d: %s", tc.want, rec.Code, rec.Body)
			}
		})
	}
}

func TestFolderHandler_MovePlaylist(t *testing.T) {
	uc := newStubFolders()
	uc.folders["f-1"], _ = playlist.NewFolder("f-1", "Rock")
	mux := newFolderMux(uc)

	rec := do(t, mux, http.MethodPut, "/api/v1/playlists/pl-1/folder", `{"folderId":"f-1"}`)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("esperava 204, obteve %d: %s", rec.Code, rec.Body)
	}
	if got := uc.moved["pl-1"]; got == nil || *got != "f-1" {
		t.Fatalf("playlist deveria ter ido para f-1, foi para %v", got)
	}

	// null and "" both mean "back to the root".
	for _, body := range []string{`{"folderId":null}`, `{"folderId":""}`, `{}`} {
		uc.moved["pl-1"] = nil
		rec = do(t, mux, http.MethodPut, "/api/v1/playlists/pl-1/folder", body)
		if rec.Code != http.StatusNoContent {
			t.Fatalf("%s: esperava 204, obteve %d", body, rec.Code)
		}
		if got, ok := uc.moved["pl-1"]; !ok || got != nil {
			t.Fatalf("%s: playlist deveria voltar para a raiz, está em %v", body, got)
		}
	}
}

// stubPlaylists implements the parts of ports.PlaylistUseCase the PATCH route touches.
type stubPlaylists struct {
	ports.PlaylistUseCase
	stored *playlist.Playlist
}

func (s *stubPlaylists) UpdatePlaylist(ctx context.Context, id playlist.PlaylistID, name, description string) (*playlist.Playlist, error) {
	if s.stored == nil || s.stored.ID != id {
		return nil, playlist.ErrPlaylistNotFound
	}
	if err := s.stored.UpdateDetails(name, description); err != nil {
		return nil, err
	}
	return s.stored, nil
}

func TestPlaylistHandler_UpdatePlaylist(t *testing.T) {
	pl, _ := playlist.NewPlaylist("pl-1", "Minha playlist nº 1", "", false)
	folder := playlist.FolderID("f-1")
	pl.FolderID = &folder
	h := NewPlaylistHandler(&stubPlaylists{stored: pl})
	mux := http.NewServeMux()
	mux.HandleFunc("PATCH /api/v1/playlists/{id}", h.UpdatePlaylist)

	rec := do(t, mux, http.MethodPatch, "/api/v1/playlists/pl-1", `{"name":"Viagem","description":"Estrada"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("esperava 200, obteve %d: %s", rec.Code, rec.Body)
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["name"] != "Viagem" || body["description"] != "Estrada" || body["folderId"] != "f-1" {
		t.Fatalf("resposta inesperada: %v", body)
	}

	for _, tc := range []struct {
		body string
		want int
	}{
		{`{"description":"sem nome"}`, http.StatusBadRequest},
		{`{"name":"   "}`, http.StatusBadRequest},
		{`not-json`, http.StatusBadRequest},
	} {
		if rec := do(t, mux, http.MethodPatch, "/api/v1/playlists/pl-1", tc.body); rec.Code != tc.want {
			t.Errorf("%s: esperava %d, obteve %d", tc.body, tc.want, rec.Code)
		}
	}

	if rec := do(t, mux, http.MethodPatch, "/api/v1/playlists/outra", `{"name":"X"}`); rec.Code != http.StatusNotFound {
		t.Errorf("playlist inexistente: esperava 404, obteve %d", rec.Code)
	}
}

// stubArtists implements ports.ArtistUseCase for the JSON shape tests.
type stubArtists struct {
	coverErr error
}

func (s *stubArtists) GetArtist(ctx context.Context, id library.ArtistID) (*library.Artist, []library.Album, error) {
	if id != "a1" {
		return nil, nil, library.ErrArtistNotFound
	}
	return &library.Artist{ID: "a1", Name: "Djavan"},
		[]library.Album{{ID: "al1", ArtistID: "a1", ArtistName: "Djavan", Title: "Luz", Year: 1982, CoverPath: "/music/secret/cover.jpg"}},
		nil
}

func (s *stubArtists) ListArtists(ctx context.Context, offset, limit int) ([]library.Artist, int, error) {
	return []library.Artist{{ID: "a1", Name: "Djavan", CreatedAt: time.Now()}}, 1, nil
}

func (s *stubArtists) ListArtistTracks(ctx context.Context, id library.ArtistID) ([]library.Track, error) {
	album := library.AlbumID("al1")
	return []library.Track{{ID: "t1", ArtistID: id, ArtistName: "Djavan", AlbumID: &album, Title: "Samurai", Duration: 250 * time.Second}}, nil
}

func (s *stubArtists) GetArtistCover(ctx context.Context, id library.ArtistID) (*ports.CoverResult, error) {
	if s.coverErr != nil {
		return nil, s.coverErr
	}
	return &ports.CoverResult{Content: io.NopCloser(bytes.NewReader([]byte("jpeg"))), MIMEType: "image/jpeg", ETag: `"c1"`}, nil
}

func TestArtistHandler_JSONShape(t *testing.T) {
	h := NewArtistHandler(&stubArtists{})
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/library/artists", h.ListArtists)
	mux.HandleFunc("GET /api/v1/library/artists/{id}", h.GetArtist)

	rec := do(t, mux, http.MethodGet, "/api/v1/library/artists", "")
	if !strings.Contains(rec.Body.String(), `"id":"a1"`) || !strings.Contains(rec.Body.String(), `"name":"Djavan"`) {
		t.Fatalf("lista de artistas deveria usar chaves minúsculas: %s", rec.Body)
	}

	rec = do(t, mux, http.MethodGet, "/api/v1/library/artists/a1", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("esperava 200, obteve %d", rec.Code)
	}
	var body struct {
		Artist map[string]any   `json:"artist"`
		Albums []map[string]any `json:"albums"`
		Tracks []map[string]any `json:"tracks"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("JSON inválido: %v", err)
	}
	if body.Artist["name"] != "Djavan" || len(body.Albums) != 1 || len(body.Tracks) != 1 {
		t.Fatalf("detalhe do artista incompleto: %s", rec.Body)
	}
	if body.Albums[0]["title"] != "Luz" || body.Albums[0]["artist_name"] != "Djavan" {
		t.Errorf("álbum com JSON inesperado: %v", body.Albums[0])
	}
	if strings.Contains(rec.Body.String(), "/music/secret") {
		t.Error("o caminho da capa no servidor não pode vazar para o cliente")
	}
	if body.Tracks[0]["title"] != "Samurai" || body.Tracks[0]["duration_sec"] != float64(250) {
		t.Errorf("faixa com JSON inesperado: %v", body.Tracks[0])
	}

	if rec := do(t, mux, http.MethodGet, "/api/v1/library/artists/zz", ""); rec.Code != http.StatusNotFound {
		t.Errorf("artista inexistente: esperava 404, obteve %d", rec.Code)
	}
}

func TestArtistHandler_Cover(t *testing.T) {
	stub := &stubArtists{}
	h := NewArtistHandler(stub)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/library/artists/{id}/cover", h.GetCover)

	rec := do(t, mux, http.MethodGet, "/api/v1/library/artists/a1/cover", "")
	if rec.Code != http.StatusOK || rec.Body.String() != "jpeg" || rec.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("capa inesperada (%d, %s): %q", rec.Code, rec.Header().Get("Content-Type"), rec.Body)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/library/artists/a1/cover", nil)
	req.Header.Set("If-None-Match", `"c1"`)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotModified {
		t.Fatalf("ETag igual deveria responder 304, obteve %d", rec.Code)
	}

	stub.coverErr = errors.New("sem capa")
	if rec := do(t, mux, http.MethodGet, "/api/v1/library/artists/a1/cover", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("sem capa: esperava 404, obteve %d", rec.Code)
	}
}
