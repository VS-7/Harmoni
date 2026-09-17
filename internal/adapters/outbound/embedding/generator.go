package embedding

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"strings"

	"harmoni/internal/core/domain/radio"
)

type LocalEmbeddingGenerator struct {
	dimensions int
}

func NewLocalEmbeddingGenerator() *LocalEmbeddingGenerator {
	return &LocalEmbeddingGenerator{
		dimensions: radio.VectorDimensions, // 384
	}
}

func (g *LocalEmbeddingGenerator) GenerateEmbedding(ctx context.Context, text string) ([]float32, error) {
	vec := make([]float32, g.dimensions)
	tokens := strings.Fields(strings.ToLower(text))
	if len(tokens) == 0 {
		return vec, nil
	}

	// Semantic feature hashing across tokens and bigrams
	for i, token := range tokens {
		g.hashTokenToVector(token, 1.0, vec)
		if i+1 < len(tokens) {
			bigram := token + "_" + tokens[i+1]
			g.hashTokenToVector(bigram, 1.5, vec)
		}
	}

	normVec, err := radio.NormalizeVector(vec)
	if err != nil {
		return vec, nil
	}
	return normVec, nil
}

func (g *LocalEmbeddingGenerator) hashTokenToVector(token string, weight float32, vec []float32) {
	h := sha256.Sum256([]byte(token))
	idx := binary.BigEndian.Uint32(h[0:4]) % uint32(g.dimensions)
	sign := float32(1.0)
	if h[4]&1 == 1 {
		sign = -1.0
	}
	vec[idx] += sign * weight
}
