package playlist

import (
	"strings"
	"time"
	"unicode/utf8"

	"harmoni/internal/core/domain/library"
)

type PlaylistID string

type Playlist struct {
	ID          PlaylistID `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	CoverPath   string     `json:"coverPath,omitempty"`
	IsSmart     bool       `json:"isSmart"`
	// FolderID is nil while the playlist sits at the root of the library.
	FolderID *FolderID `json:"folderId,omitempty"`
	// CoverTrackIDs are the tracks whose art composes the cover mosaic: the first track
	// of each of the first MaxCoverTracks distinct albums, in playlist order.
	CoverTrackIDs []library.TrackID `json:"coverTrackIds"`
	Tracks        []library.Track   `json:"tracks"`
	TrackCount    int               `json:"trackCount"`
	Duration      int               `json:"duration"` // in seconds
	CreatedAt     time.Time         `json:"createdAt"`
	UpdatedAt     time.Time         `json:"updatedAt"`
}

// MaxCoverTracks is the size of the 2x2 cover mosaic.
const MaxCoverTracks = 4

// PickCoverTracks chooses the mosaic tracks: one per album (a track without album counts
// as its own), keeping playlist order.
func PickCoverTracks(tracks []library.Track) []library.TrackID {
	ids := make([]library.TrackID, 0, MaxCoverTracks)
	seen := make(map[string]bool, MaxCoverTracks)
	for _, t := range tracks {
		key := "track:" + string(t.ID)
		if t.AlbumID != nil {
			key = "album:" + string(*t.AlbumID)
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		ids = append(ids, t.ID)
		if len(ids) == MaxCoverTracks {
			break
		}
	}
	return ids
}

func NewPlaylist(id PlaylistID, name, description string, isSmart bool) (*Playlist, error) {
	cleanName, err := validatePlaylistName(name)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	return &Playlist{
		ID:            id,
		Name:          cleanName,
		Description:   strings.TrimSpace(description),
		IsSmart:       isSmart,
		Tracks:        make([]library.Track, 0),
		CoverTrackIDs: make([]library.TrackID, 0),
		TrackCount:    0,
		Duration:      0,
		CreatedAt:     now,
		UpdatedAt:     now,
	}, nil
}

// UpdateDetails renames the playlist and replaces its description ("Editar detalhes").
func (p *Playlist) UpdateDetails(name, description string) error {
	cleanName, err := validatePlaylistName(name)
	if err != nil {
		return err
	}
	p.Name = cleanName
	p.Description = strings.TrimSpace(description)
	p.UpdatedAt = time.Now().UTC()
	return nil
}

func validatePlaylistName(name string) (string, error) {
	cleanName := strings.TrimSpace(name)
	if cleanName == "" {
		return "", ErrInvalidPlaylistName
	}
	if utf8.RuneCountInString(cleanName) > MaxNameLength {
		return "", ErrNameTooLong
	}
	return cleanName, nil
}
