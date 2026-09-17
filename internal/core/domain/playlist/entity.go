package playlist

import (
	"strings"
	"time"

	"harmoni/internal/core/domain/library"
)

type PlaylistID string

type Playlist struct {
	ID          PlaylistID      `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	CoverPath   string          `json:"coverPath,omitempty"`
	IsSmart     bool            `json:"isSmart"`
	Tracks      []library.Track `json:"tracks"`
	TrackCount  int             `json:"trackCount"`
	Duration    int             `json:"duration"` // in seconds
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

func NewPlaylist(id PlaylistID, name, description string, isSmart bool) (*Playlist, error) {
	cleanName := strings.TrimSpace(name)
	if cleanName == "" {
		return nil, ErrInvalidPlaylistName
	}
	now := time.Now().UTC()
	return &Playlist{
		ID:          id,
		Name:        cleanName,
		Description: strings.TrimSpace(description),
		IsSmart:     isSmart,
		Tracks:      make([]library.Track, 0),
		TrackCount:  0,
		Duration:    0,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}
