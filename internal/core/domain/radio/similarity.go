package radio

import (
	"math/rand"
	"sort"
	"time"

	"harmoni/internal/core/domain/library"
)

type ScoredCandidate struct {
	Track            library.Track
	CosineSimilarity float32
	FinalScore       float32
}

type RadioPolicy struct {
	ArtistRepetitionPenalty float32 // e.g. 0.25 penalty if artist appeared in seed or recent items
	DiversityJitter         float32 // e.g. 0.05 random jitter to avoid deterministic order
	MinThreshold            float32 // minimum cosine similarity to consider
}

func DefaultRadioPolicy() RadioPolicy {
	return RadioPolicy{
		ArtistRepetitionPenalty: 0.20,
		DiversityJitter:         0.05,
		MinThreshold:            0.15,
	}
}

// RankAndShuffle applies anti-repetition penalties and controlled dynamic shuffle to candidates.
func RankAndShuffle(
	candidates []library.Track,
	similarities []float32,
	seedArtistID library.ArtistID,
	recentArtistIDs []library.ArtistID,
	recentTrackIDs []library.TrackID,
	limit int,
	policy RadioPolicy,
) []library.Track {
	if len(candidates) == 0 || limit <= 0 {
		return nil
	}

	recentTracksMap := make(map[library.TrackID]bool, len(recentTrackIDs))
	for _, tid := range recentTrackIDs {
		recentTracksMap[tid] = true
	}

	recentArtistsCount := make(map[library.ArtistID]int, len(recentArtistIDs)+1)
	recentArtistsCount[seedArtistID]++
	for _, aid := range recentArtistIDs {
		recentArtistsCount[aid]++
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	var scored []ScoredCandidate

	for i, track := range candidates {
		// Filter out recently played tracks
		if recentTracksMap[track.ID] {
			continue
		}

		var sim float32 = 0.5
		if i < len(similarities) {
			sim = similarities[i]
		}

		if sim < policy.MinThreshold {
			continue
		}

		score := sim

		// Apply penalty for repeated artists
		if count, ok := recentArtistsCount[track.ArtistID]; ok && count > 0 {
			penalty := policy.ArtistRepetitionPenalty * float32(count)
			score -= penalty
		}

		// Apply small dynamic jitter for anti-deterministic variety
		if policy.DiversityJitter > 0 {
			jitter := (rng.Float32()*2.0 - 1.0) * policy.DiversityJitter
			score += jitter
		}

		scored = append(scored, ScoredCandidate{
			Track:            track,
			CosineSimilarity: sim,
			FinalScore:       score,
		})
	}

	// Sort descending by FinalScore
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].FinalScore > scored[j].FinalScore
	})

	resultCount := limit
	if len(scored) < resultCount {
		resultCount = len(scored)
	}

	result := make([]library.Track, resultCount)
	for i := 0; i < resultCount; i++ {
		result[i] = scored[i].Track
	}

	return result
}
