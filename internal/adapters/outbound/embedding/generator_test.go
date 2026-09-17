package embedding_test

import (
	"context"
	"math"
	"testing"

	"harmoni/internal/adapters/outbound/embedding"
	"harmoni/internal/core/domain/radio"
)

func TestLocalEmbeddingGenerator(t *testing.T) {
	ctx := context.Background()
	gen := embedding.NewLocalEmbeddingGenerator()

	vecRock1, err := gen.GenerateEmbedding(ctx, "Bohemian Rhapsody Queen A Night at the Opera Rock")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(vecRock1) != radio.VectorDimensions {
		t.Errorf("expected %d dimensions, got %d", radio.VectorDimensions, len(vecRock1))
	}

	// Verify norm is approximately 1.0
	var sumSquares float64
	for _, val := range vecRock1 {
		sumSquares += float64(val) * float64(val)
	}
	norm := math.Sqrt(sumSquares)
	if math.Abs(norm-1.0) > 0.001 {
		t.Errorf("expected unit norm ~1.0, got %f", norm)
	}

	// Similar song (same band & genre)
	vecRock2, _ := gen.GenerateEmbedding(ctx, "Don't Stop Me Now Queen Jazz Rock")
	// Completely different song (Classical Bach)
	vecClassical, _ := gen.GenerateEmbedding(ctx, "Toccata and Fugue Johann Sebastian Bach Classical Organ Baroque")

	simRock, _ := radio.CosineSimilarity(vecRock1, vecRock2)
	simDiff, _ := radio.CosineSimilarity(vecRock1, vecClassical)

	if simRock <= simDiff {
		t.Errorf("expected simRock (%f) to be greater than simDiff (%f)", simRock, simDiff)
	}
}
