package radio

import (
	"errors"
	"math"
)

const VectorDimensions = 384

var (
	ErrDimensionMismatch = errors.New("dimensões do vetor são incompatíveis")
	ErrZeroVector        = errors.New("vetor com magnitude zero não pode ser normalizado")
)

// CosineSimilarity calculates the cosine similarity between two float32 vectors.
// Returns a value between -1.0 and 1.0 (where 1.0 means identical angle).
func CosineSimilarity(a, b []float32) (float32, error) {
	if len(a) != len(b) {
		return 0, ErrDimensionMismatch
	}
	if len(a) == 0 {
		return 0, nil
	}

	var dotProduct float64
	var normA float64
	var normB float64

	for i := 0; i < len(a); i++ {
		valA := float64(a[i])
		valB := float64(b[i])
		dotProduct += valA * valB
		normA += valA * valA
		normB += valB * valB
	}

	if normA == 0 || normB == 0 {
		return 0, nil
	}

	similarity := dotProduct / (math.Sqrt(normA) * math.Sqrt(normB))
	return float32(similarity), nil
}

// NormalizeVector returns a unit vector (norm = 1.0) for cosine distance optimization.
func NormalizeVector(v []float32) ([]float32, error) {
	var sumSquares float64
	for _, val := range v {
		sumSquares += float64(val) * float64(val)
	}

	magnitude := math.Sqrt(sumSquares)
	if magnitude == 0 {
		return nil, ErrZeroVector
	}

	normalized := make([]float32, len(v))
	for i, val := range v {
		normalized[i] = float32(float64(val) / magnitude)
	}

	return normalized, nil
}
