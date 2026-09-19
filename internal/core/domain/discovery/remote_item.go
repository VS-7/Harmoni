// Package discovery holds the pure domain model for remote catalog browsing
// (searching YouTube / YouTube Music). Guardrail 1: no infrastructure imports.
package discovery

import (
	"strings"
	"unicode"
)

// Kind classifies a remote catalog item.
type Kind string

const (
	KindAll      Kind = "all"
	KindTrack    Kind = "track"
	KindPlaylist Kind = "playlist"
	KindArtist   Kind = "artist"
)

const (
	// MaxQueryLength caps the normalized query, in runes (RF7.1).
	MaxQueryLength = 120
	// DefaultLimit is applied when the caller sends no limit.
	DefaultLimit = 20
	// MaxLimit protects the yt-dlp call and the response size.
	MaxLimit = 50
)

// RemoteItem is one result of a remote catalog lookup.
type RemoteItem struct {
	ID           string
	Kind         Kind
	Title        string
	Artist       string
	DurationSec  int
	ThumbnailURL string
	// ItemCount is the number of tracks, for playlists only.
	ItemCount int
	// InLibrary is filled by the use case from tracks.source_id, never by the adapter.
	InLibrary bool
}

// RemotePlaylist is a remote playlist with its flat track list (RF7.2).
type RemotePlaylist struct {
	ID           string
	Title        string
	Artist       string
	ThumbnailURL string
	ItemCount    int
	Tracks       []RemoteItem
}

// RemoteArtist is a remote channel with its popular tracks and releases (RF7.3).
type RemoteArtist struct {
	ID           string
	Name         string
	ThumbnailURL string
	TopTracks    []RemoteItem
	Playlists    []RemoteItem
}

// Query is a normalized, validated search request.
type Query struct {
	Text  string
	Kind  Kind
	Limit int
}

// NewQuery normalizes user input: trims, drops control characters and caps the
// length, so nothing unexpected reaches the external process (RF7.1, RNF8).
func NewQuery(rawText, rawKind string, limit int) (Query, error) {
	text := normalizeText(rawText)
	if text == "" {
		return Query{}, ErrEmptyQuery
	}

	kind, err := ParseKind(rawKind)
	if err != nil {
		return Query{}, err
	}

	switch {
	case limit <= 0:
		limit = DefaultLimit
	case limit > MaxLimit:
		limit = MaxLimit
	}

	return Query{Text: text, Kind: kind, Limit: limit}, nil
}

// ParseKind accepts an empty string as "all", so the type param stays optional.
func ParseKind(raw string) (Kind, error) {
	switch Kind(strings.ToLower(strings.TrimSpace(raw))) {
	case "", KindAll:
		return KindAll, nil
	case KindTrack:
		return KindTrack, nil
	case KindPlaylist:
		return KindPlaylist, nil
	case KindArtist:
		return KindArtist, nil
	default:
		return "", ErrInvalidKind
	}
}

// CacheKey identifies the query in the use case cache (RF7.4).
func (q Query) CacheKey() string {
	return "search:" + string(q.Kind) + ":" + itoa(q.Limit) + ":" + strings.ToLower(q.Text)
}

// Includes reports whether the query asks for results of the given kind.
func (q Query) Includes(k Kind) bool {
	return q.Kind == KindAll || q.Kind == k
}

// normalizeText collapses whitespace, removes control characters and caps the rune count.
func normalizeText(raw string) string {
	var b strings.Builder
	b.Grow(len(raw))

	lastWasSpace := true // leading spaces are dropped
	for _, r := range raw {
		if unicode.IsControl(r) {
			continue
		}
		if unicode.IsSpace(r) {
			if !lastWasSpace {
				b.WriteRune(' ')
				lastWasSpace = true
			}
			continue
		}
		b.WriteRune(r)
		lastWasSpace = false
	}

	text := strings.TrimSpace(b.String())
	if runes := []rune(text); len(runes) > MaxQueryLength {
		text = strings.TrimSpace(string(runes[:MaxQueryLength]))
	}
	return text
}

// itoa avoids pulling strconv into the domain for a single small conversion.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits [20]byte
	i := len(digits)
	for n > 0 {
		i--
		digits[i] = byte('0' + n%10)
		n /= 10
	}
	return string(digits[i:])
}
