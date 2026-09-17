package playlist_test

import (
	"testing"

	"harmoni/internal/core/domain/playlist"
)

func TestNewPlaylist(t *testing.T) {
	t.Run("sucesso ao criar playlist válida", func(t *testing.T) {
		pl, err := playlist.NewPlaylist("pl-1", "Minhas Favoritas", "Músicas para relaxar", false)
		if err != nil {
			t.Fatalf("erro inesperado: %v", err)
		}
		if pl.ID != "pl-1" {
			t.Errorf("esperava id 'pl-1', obteve '%s'", pl.ID)
		}
		if pl.Name != "Minhas Favoritas" {
			t.Errorf("esperava nome 'Minhas Favoritas', obteve '%s'", pl.Name)
		}
		if pl.Description != "Músicas para relaxar" {
			t.Errorf("esperava descrição 'Músicas para relaxar', obteve '%s'", pl.Description)
		}
		if pl.IsSmart {
			t.Errorf("esperava IsSmart false")
		}
	})

	t.Run("erro ao criar playlist com nome vazio", func(t *testing.T) {
		_, err := playlist.NewPlaylist("pl-2", "   ", "desc", false)
		if err == nil {
			t.Fatalf("esperava erro para nome vazio, obteve nil")
		}
	})
}
