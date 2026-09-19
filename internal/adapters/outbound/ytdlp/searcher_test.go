package ytdlp

import (
	"context"
	"strings"
	"testing"

	"harmoni/internal/core/domain/discovery"
)

// stubRunner replaces the yt-dlp process, recording the arguments it was called with.
func stubRunner(outputs map[string]string, calls *[][]string) commandRunner {
	return func(_ context.Context, args []string) (string, error) {
		if calls != nil {
			*calls = append(*calls, args)
		}
		target := args[len(args)-1]
		for prefix, out := range outputs {
			if strings.Contains(target, prefix) {
				return out, nil
			}
		}
		return "", nil
	}
}

const trackLine = `{"id":"lBDDMrUCz1A","title":"Legião Urbana - Tempo Perdido (Official Video)","duration":352,"channel":"Legião Urbana"}`

func TestSearchTracksParsesAndCleansTitles(t *testing.T) {
	var calls [][]string
	s := &Searcher{run: stubRunner(map[string]string{"ytsearch": trackLine}, &calls)}

	query, err := discovery.NewQuery("legião urbana", "track", 5)
	if err != nil {
		t.Fatal(err)
	}

	items, err := s.Search(context.Background(), query)
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("esperava 1 resultado, veio %d", len(items))
	}

	got := items[0]
	if got.Title != "Tempo Perdido" || got.Artist != "Legião Urbana" {
		t.Errorf("título ou artista inesperados: %+v", got)
	}
	if got.Kind != discovery.KindTrack || got.DurationSec != 352 {
		t.Errorf("item inesperado: %+v", got)
	}
	if got.ThumbnailURL == "" {
		t.Error("faixa deveria receber capa derivada do id")
	}

	// The query text must travel as a single argv element, never through a shell.
	target := calls[0][len(calls[0])-1]
	if target != "ytsearch5:legião urbana" {
		t.Errorf("alvo de busca inesperado: %q", target)
	}
	if !contains(calls[0], "--flat-playlist") || !contains(calls[0], "--") {
		t.Errorf("flags obrigatórias ausentes: %v", calls[0])
	}
}

func TestSearchAllMergesKindsAndFiltersByIDShape(t *testing.T) {
	playlistLine := `{"id":"PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6","title":"Rock Nacional","channel":"Vários"}`
	channelLine := `{"id":"UCabcdefghijklmnopqrstuv","title":"Legião Urbana","channel":"Legião Urbana"}`

	s := &Searcher{run: stubRunner(map[string]string{
		"ytsearch": trackLine + "\n" + channelLine, // a channel in the track list is dropped
		"EgIQAw":   playlistLine,
		"EgIQAg":   channelLine,
	}, nil)}

	query, err := discovery.NewQuery("legião urbana", "all", 20)
	if err != nil {
		t.Fatal(err)
	}

	items, err := s.Search(context.Background(), query)
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("esperava 3 resultados (faixa, playlist, artista), veio %d: %+v", len(items), items)
	}
	if items[0].Kind != discovery.KindTrack || items[1].Kind != discovery.KindPlaylist || items[2].Kind != discovery.KindArtist {
		t.Errorf("ordem de tipos inesperada: %+v", items)
	}
}

func TestSearchQueryIsEscapedInResultsURL(t *testing.T) {
	var calls [][]string
	s := &Searcher{run: stubRunner(map[string]string{}, &calls)}

	query, err := discovery.NewQuery("legião & urbana", "playlist", 10)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Search(context.Background(), query); err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}

	target := calls[0][len(calls[0])-1]
	if strings.Contains(target, "legião & urbana") {
		t.Errorf("a consulta deveria ser percent-encoded na url: %q", target)
	}
	if !strings.Contains(target, "search_query=legi%C3%A3o+%26+urbana") {
		t.Errorf("codificação inesperada: %q", target)
	}
}

func TestGetPlaylistReadsEntriesAndCount(t *testing.T) {
	single := `{"id":"PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6","title":"Rock Nacional","channel":"Vários","playlist_count":2,
		"entries":[{"id":"lBDDMrUCz1A","title":"Tempo Perdido [4K]","duration":352},
		{"id":"aBcDeFgHiJk","title":"Eduardo e Mônica (Lyrics)","duration":300},
		{"id":"invalido","title":"ignorado"}]}`

	s := &Searcher{run: stubRunner(map[string]string{"playlist?list=": single}, nil)}

	pl, err := s.GetPlaylist(context.Background(), "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6")
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if pl.Title != "Rock Nacional" || pl.ItemCount != 2 {
		t.Errorf("metadados inesperados: %+v", pl)
	}
	if len(pl.Tracks) != 2 {
		t.Fatalf("entrada com id inválido deveria ser descartada, veio %d faixas", len(pl.Tracks))
	}
	if pl.Tracks[0].Title != "Tempo Perdido" || pl.Tracks[1].Title != "Eduardo e Mônica" {
		t.Errorf("títulos não foram higienizados: %+v", pl.Tracks)
	}
}

func TestGetPlaylistRejectsInvalidID(t *testing.T) {
	s := &Searcher{run: stubRunner(map[string]string{}, nil)}
	if _, err := s.GetPlaylist(context.Background(), "nao-e-uma-playlist!"); err == nil {
		t.Error("id inválido deveria ser recusado antes de chamar o yt-dlp")
	}
}

func TestGetArtistSplitsTracksAndPlaylists(t *testing.T) {
	videos := `{"id":"UCabcdefghijklmnopqrstuv","channel":"Legião Urbana","entries":[{"id":"lBDDMrUCz1A","title":"Tempo Perdido"}]}`
	lists := `{"id":"UCabcdefghijklmnopqrstuv","channel":"Legião Urbana","entries":[{"id":"PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6","title":"Álbuns"}]}`

	s := &Searcher{run: stubRunner(map[string]string{"/videos": videos, "/playlists": lists}, nil)}

	artist, err := s.GetArtist(context.Background(), "UCabcdefghijklmnopqrstuv")
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if artist.Name != "Legião Urbana" {
		t.Errorf("nome inesperado: %q", artist.Name)
	}
	if len(artist.TopTracks) != 1 || len(artist.Playlists) != 1 {
		t.Errorf("abas não foram separadas: %+v", artist)
	}
}

func TestGetArtistRejectsInvalidChannel(t *testing.T) {
	s := &Searcher{run: stubRunner(map[string]string{}, nil)}
	if _, err := s.GetArtist(context.Background(), "nao-e-um-canal"); err == nil {
		t.Error("canal inválido deveria ser recusado")
	}
}
