package playlist_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/domain/playlist"
)

func TestNewFolder(t *testing.T) {
	t.Run("sucesso com nome aparado", func(t *testing.T) {
		f, err := playlist.NewFolder("f-1", "  Treino  ")
		if err != nil {
			t.Fatalf("erro inesperado: %v", err)
		}
		if f.Name != "Treino" {
			t.Errorf("esperava nome 'Treino', obteve '%s'", f.Name)
		}
		if f.CreatedAt.IsZero() || f.UpdatedAt.IsZero() {
			t.Error("esperava datas preenchidas")
		}
	})

	t.Run("erro com nome vazio", func(t *testing.T) {
		if _, err := playlist.NewFolder("f-2", "   "); !errors.Is(err, playlist.ErrInvalidFolderName) {
			t.Fatalf("esperava ErrInvalidFolderName, obteve %v", err)
		}
	})

	t.Run("erro com nome longo demais", func(t *testing.T) {
		long := strings.Repeat("á", playlist.MaxNameLength+1)
		if _, err := playlist.NewFolder("f-3", long); !errors.Is(err, playlist.ErrNameTooLong) {
			t.Fatalf("esperava ErrNameTooLong, obteve %v", err)
		}
	})

	t.Run("limite conta caracteres, não bytes", func(t *testing.T) {
		exact := strings.Repeat("á", playlist.MaxNameLength)
		if _, err := playlist.NewFolder("f-4", exact); err != nil {
			t.Fatalf("255 caracteres multibyte deveriam ser aceitos: %v", err)
		}
	})
}

func TestFolderRename(t *testing.T) {
	f, _ := playlist.NewFolder("f-1", "Antigo")

	if err := f.Rename(" Novo "); err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if f.Name != "Novo" {
		t.Errorf("esperava 'Novo', obteve '%s'", f.Name)
	}

	if err := f.Rename(""); !errors.Is(err, playlist.ErrInvalidFolderName) {
		t.Fatalf("esperava ErrInvalidFolderName, obteve %v", err)
	}
	if f.Name != "Novo" {
		t.Errorf("uma renomeação inválida não pode alterar o nome, obteve '%s'", f.Name)
	}
}

func TestPlaylistUpdateDetails(t *testing.T) {
	pl, _ := playlist.NewPlaylist("pl-1", "Minha playlist nº 1", "", false)
	before := pl.UpdatedAt

	if err := pl.UpdateDetails("  Viagem ", "  Estrada afora "); err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if pl.Name != "Viagem" || pl.Description != "Estrada afora" {
		t.Errorf("detalhes não aplicados: %q / %q", pl.Name, pl.Description)
	}
	if pl.UpdatedAt.Before(before) {
		t.Error("UpdatedAt deveria avançar")
	}

	if err := pl.UpdateDetails(" ", "x"); !errors.Is(err, playlist.ErrInvalidPlaylistName) {
		t.Fatalf("esperava ErrInvalidPlaylistName, obteve %v", err)
	}
	if pl.Name != "Viagem" || pl.Description != "Estrada afora" {
		t.Error("uma edição inválida não pode alterar a playlist")
	}
}

func TestPickCoverTracks(t *testing.T) {
	album := func(id string) *library.AlbumID {
		a := library.AlbumID(id)
		return &a
	}
	tracks := []library.Track{
		{ID: "t1", AlbumID: album("a")},
		{ID: "t2", AlbumID: album("a")},
		{ID: "t3"},
		{ID: "t4", AlbumID: album("b")},
		{ID: "t5"},
		{ID: "t6", AlbumID: album("c")},
	}

	got := playlist.PickCoverTracks(tracks)
	want := []library.TrackID{"t1", "t3", "t4", "t5"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("esperava %v, obteve %v", want, got)
	}

	if got := playlist.PickCoverTracks(nil); len(got) != 0 {
		t.Fatalf("playlist vazia não tem capa, obteve %v", got)
	}

	single := playlist.PickCoverTracks(tracks[:2])
	if !reflect.DeepEqual(single, []library.TrackID{"t1"}) {
		t.Fatalf("um único álbum deveria render uma faixa, obteve %v", single)
	}
}
