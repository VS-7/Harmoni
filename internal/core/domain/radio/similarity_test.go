package radio_test

import (
	"testing"
	"time"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/domain/radio"
)

func TestCosineSimilarity(t *testing.T) {
	v1 := []float32{1.0, 0.0, 0.0}
	v2 := []float32{1.0, 0.0, 0.0}
	sim, err := radio.CosineSimilarity(v1, v2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sim < 0.9999 {
		t.Errorf("expected ~1.0 for identical vectors, got %f", sim)
	}

	vOrthogonal := []float32{0.0, 1.0, 0.0}
	sim, err = radio.CosineSimilarity(v1, vOrthogonal)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sim > 0.0001 || sim < -0.0001 {
		t.Errorf("expected ~0.0 for orthogonal vectors, got %f", sim)
	}
}

func TestNormalizeVector(t *testing.T) {
	v := []float32{3.0, 4.0}
	norm, err := radio.NormalizeVector(v)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if norm[0] != 0.6 || norm[1] != 0.8 {
		t.Errorf("expected [0.6, 0.8], got %v", norm)
	}
}

func TestRankAndShuffleFiltersHistoryAndPenalizesRepeat(t *testing.T) {
	t1, _ := library.NewTrack("t1", "Track 1", "artist1", 100*time.Second, "/p1", 100, library.FormatMP3)
	t2, _ := library.NewTrack("t2", "Track 2", "artist1", 100*time.Second, "/p2", 100, library.FormatMP3)
	t3, _ := library.NewTrack("t3", "Track 3", "artist2", 100*time.Second, "/p3", 100, library.FormatMP3)

	candidates := []library.Track{*t1, *t2, *t3}
	similarities := []float32{0.9, 0.88, 0.85}

	policy := radio.DefaultRadioPolicy()
	policy.DiversityJitter = 0 // deterministic for testing

	// Filter t1 in history
	recentTracks := []library.TrackID{"t1"}
	recentArtists := []library.ArtistID{"artist1"}

	ranked := radio.RankAndShuffle(
		candidates,
		similarities,
		"artist1",
		recentArtists,
		recentTracks,
		10,
		policy,
	)

	// t1 must be filtered out
	for _, tr := range ranked {
		if tr.ID == "t1" {
			t.Errorf("track t1 should have been filtered out by history")
		}
	}

	// artist2 (t3) had sim 0.85 and 0 penalty
	// artist1 (t2) had sim 0.88 - penalty(0.20 * 2) = 0.48
	// so t3 should be ranked first before t2!
	if len(ranked) < 2 {
		t.Fatalf("expected 2 ranked tracks, got %d", len(ranked))
	}
	if ranked[0].ID != "t3" {
		t.Errorf("expected t3 to be ranked first due to artist penalty, got %s", ranked[0].ID)
	}
}
