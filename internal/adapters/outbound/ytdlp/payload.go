package ytdlp

import (
	"strings"

	"harmoni/internal/core/domain/discovery"
	"harmoni/internal/core/domain/ingest"
)

// ytEntry is the subset of the yt-dlp JSON we depend on. Every field is optional:
// flat entries, full video dumps and playlist entries share this shape but not all keys.
type ytEntry struct {
	ID            string        `json:"id"`
	Title         string        `json:"title"`
	Track         string        `json:"track"`  // YouTube Music: the real song name
	Artist        string        `json:"artist"` // YouTube Music: the real artist
	Creator       string        `json:"creator"`
	Uploader      string        `json:"uploader"`
	Channel       string        `json:"channel"`
	Duration      float64       `json:"duration"`
	PlaylistCount int           `json:"playlist_count"`
	Thumbnail     string        `json:"thumbnail"`
	Thumbnails    []ytThumbnail `json:"thumbnails"`
}

type ytThumbnail struct {
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// ytPlaylist is the --dump-single-json shape of a playlist or a channel tab.
type ytPlaylist struct {
	ID            string        `json:"id"`
	Title         string        `json:"title"`
	Channel       string        `json:"channel"`
	Uploader      string        `json:"uploader"`
	PlaylistCount int           `json:"playlist_count"`
	Thumbnails    []ytThumbnail `json:"thumbnails"`
	Entries       []ytEntry     `json:"entries"`
}

// toRemoteItem maps the payload to the domain, preferring the structured YouTube Music
// fields and cleaning upload noise out of the title (RF8.6).
func (e ytEntry) toRemoteItem(kind discovery.Kind) discovery.RemoteItem {
	title := strings.TrimSpace(e.Track)
	artist := strings.TrimSpace(e.Artist)

	if title == "" {
		title = ingest.CleanTitle(e.Title)
	}
	if artist == "" {
		artist = firstNonEmpty(e.Creator, e.Uploader, e.Channel)
	}
	// "Artista - Música" in the raw title is the last resort for the artist name.
	if artist == "" {
		if splitArtist, splitTitle := ingest.SplitArtistTitle(e.Title); splitArtist != "" {
			artist, title = splitArtist, splitTitle
		}
	} else {
		// The channel already named the artist, so "Artista - Música" would repeat it.
		title = stripArtistPrefix(title, artist)
	}

	item := discovery.RemoteItem{
		ID:           e.ID,
		Kind:         kind,
		Title:        title,
		Artist:       artist,
		DurationSec:  int(e.Duration),
		ThumbnailURL: e.bestThumbnail(),
		ItemCount:    e.PlaylistCount,
	}

	// A video always has a predictable cover, which spares the flat search from
	// carrying the thumbnail list.
	if item.ThumbnailURL == "" && kind == discovery.KindTrack && videoIDPattern.MatchString(e.ID) {
		item.ThumbnailURL = "https://i.ytimg.com/vi/" + e.ID + "/hqdefault.jpg"
	}
	return item
}

// bestThumbnail picks the largest thumbnail that is not oversized for a list row.
func (e ytEntry) bestThumbnail() string {
	if url := strings.TrimSpace(e.Thumbnail); url != "" {
		return url
	}
	return pickThumbnail(e.Thumbnails)
}

func (p ytPlaylist) bestThumbnail() string {
	return pickThumbnail(p.Thumbnails)
}

func (p ytPlaylist) artistName() string {
	return firstNonEmpty(p.Channel, p.Uploader)
}

// maxThumbnailWidth keeps covers small enough for a mobile list without a second fetch.
const maxThumbnailWidth = 800

func pickThumbnail(thumbnails []ytThumbnail) string {
	best := ""
	bestWidth := -1

	for _, t := range thumbnails {
		if t.URL == "" {
			continue
		}
		width := t.Width
		if width == 0 {
			width = t.Height
		}
		if width > maxThumbnailWidth {
			continue
		}
		if width > bestWidth {
			best, bestWidth = t.URL, width
		}
	}

	// Every candidate was oversized: keep the first one rather than none.
	if best == "" && len(thumbnails) > 0 {
		best = thumbnails[0].URL
	}
	return best
}

// stripArtistPrefix drops the "Artista - " prefix YouTube titles usually repeat when the
// channel name already carries the artist. It never empties the title.
func stripArtistPrefix(title, artist string) string {
	lowerTitle := strings.ToLower(title)
	lowerArtist := strings.ToLower(strings.TrimSpace(artist))
	if lowerArtist == "" || !strings.HasPrefix(lowerTitle, lowerArtist) {
		return title
	}

	rest := strings.TrimSpace(title[len(artist):])
	for _, sep := range []string{"-", "–", "—", "|", ":"} {
		if strings.HasPrefix(rest, sep) {
			if stripped := strings.TrimSpace(strings.TrimPrefix(rest, sep)); stripped != "" {
				return stripped
			}
		}
	}
	return title
}
