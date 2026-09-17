package usecase_test

import (
	"context"
	"testing"
	"time"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/domain/radio"
	"harmoni/internal/core/usecase"
)

type mockRadioRepository struct {
	similarTracks []library.Track
	similarities  []float32
}

func (m *mockRadioRepository) FindSimilarByVector(ctx context.Context, vector []float32, limit int) ([]library.Track, []float32, error) {
	return m.similarTracks, m.similarities, nil
}

func TestGenerateSongRadio(t *testing.T) {
	ctx := context.Background()

	tSeed, _ := library.NewTrack("seed", "Seed Song", "art1", 200*time.Second, "/music/seed.mp3", 100, library.FormatMP3)
	tSeed.SetEmbedding(make([]float32, radio.VectorDimensions))

	t1, _ := library.NewTrack("t1", "Similar 1", "art2", 200*time.Second, "/music/t1.mp3", 100, library.FormatMP3)
	t2, _ := library.NewTrack("t2", "Similar 2", "art3", 200*time.Second, "/music/t2.mp3", 100, library.FormatMP3)

	reader := &mockTrackReader{
		tracks: map[library.TrackID]*library.Track{
			"seed": tSeed,
			"t1":   t1,
			"t2":   t2,
		},
	}

	radioRepo := &mockRadioRepository{
		similarTracks: []library.Track{*tSeed, *t1, *t2},
		similarities:  []float32{1.0, 0.9, 0.85},
	}

	svc := usecase.NewRadioService(reader, radioRepo, nil)

	results, err := svc.GenerateSongRadio(ctx, "seed", 2, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Seed song must be excluded
	for _, tr := range results {
		if tr.ID == "seed" {
			t.Errorf("seed track should have been excluded from recommendations")
		}
	}

	if len(results) != 2 {
		t.Errorf("expected 2 results, got %d", len(results))
	}
}
