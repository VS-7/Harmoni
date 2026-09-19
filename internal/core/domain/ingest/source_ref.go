package ingest

import (
	"net/url"
	"regexp"
	"strings"
)

type SourceProvider string

const ProviderYouTube SourceProvider = "youtube"

type SourceKind string

const (
	KindTrack           SourceKind = "track"
	KindPlaylist        SourceKind = "playlist"
	KindTrackInPlaylist SourceKind = "track_in_playlist"
	KindChannel         SourceKind = "channel"
)

// DownloadMode resolves ambiguous links (watch?v=...&list=...). Empty means default behavior.
type DownloadMode string

const (
	ModeDefault  DownloadMode = ""
	ModeTrack    DownloadMode = "track"
	ModePlaylist DownloadMode = "playlist"
)

// MixPlaylistLimit caps auto-generated YouTube mixes (list=RD...), which are near-infinite.
const MixPlaylistLimit = 50

var (
	videoIDPattern    = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
	playlistIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{10,64}$`)
	channelIDPattern  = regexp.MustCompile(`^UC[A-Za-z0-9_-]{22}$`)
	handlePattern     = regexp.MustCompile(`^@[A-Za-z0-9._-]{3,30}$`)
)

var youtubeHosts = map[string]bool{
	"youtube.com":       true,
	"www.youtube.com":   true,
	"m.youtube.com":     true,
	"music.youtube.com": true,
	"youtu.be":          true,
}

// SourceRef is a validated reference to external media. Canonical URLs are always
// rebuilt from its fields, so raw user input never reaches external processes.
type SourceRef struct {
	Provider   SourceProvider
	Kind       SourceKind
	VideoID    string
	PlaylistID string
	ChannelID  string // "UC..." id or "@handle"
	Music      bool   // link came from music.youtube.com (richer artist/track metadata)
}

// ParseSourceURL validates a user-provided link against the host allowlist and extracts its IDs.
func ParseSourceURL(rawURL string) (SourceRef, error) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" || len(trimmed) > 2048 {
		return SourceRef{}, ErrInvalidURL
	}
	if strings.ContainsAny(trimmed, " \t\r\n") {
		return SourceRef{}, ErrUnsafeURL
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return SourceRef{}, ErrInvalidURL
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return SourceRef{}, ErrInvalidURL
	}
	if parsed.User != nil || parsed.Port() != "" {
		return SourceRef{}, ErrUnsafeURL
	}

	host := strings.ToLower(parsed.Hostname())
	if !youtubeHosts[host] {
		return SourceRef{}, ErrUnsupportedSource
	}

	ref := SourceRef{Provider: ProviderYouTube, Music: host == "music.youtube.com"}
	query, err := url.ParseQuery(parsed.RawQuery)
	if err != nil {
		return SourceRef{}, ErrUnsafeURL
	}
	segments := strings.Split(strings.Trim(parsed.Path, "/"), "/")

	if host == "youtu.be" {
		ref.VideoID = segments[0]
	} else {
		switch segments[0] {
		case "watch":
			ref.VideoID = query.Get("v")
		case "shorts", "live", "embed":
			if len(segments) > 1 {
				ref.VideoID = segments[1]
			}
		case "playlist":
			// handled by list= below
		case "channel":
			if len(segments) > 1 && channelIDPattern.MatchString(segments[1]) {
				ref.ChannelID = segments[1]
			}
		default:
			if handlePattern.MatchString(segments[0]) {
				ref.ChannelID = segments[0]
			}
		}
	}

	if list := query.Get("list"); list != "" {
		if !playlistIDPattern.MatchString(list) {
			return SourceRef{}, ErrInvalidSourceID
		}
		ref.PlaylistID = list
	}
	if ref.VideoID != "" && !videoIDPattern.MatchString(ref.VideoID) {
		return SourceRef{}, ErrInvalidSourceID
	}

	switch {
	case ref.VideoID != "" && ref.PlaylistID != "":
		ref.Kind = KindTrackInPlaylist
	case ref.VideoID != "":
		ref.Kind = KindTrack
	case ref.PlaylistID != "":
		ref.Kind = KindPlaylist
	case ref.ChannelID != "":
		ref.Kind = KindChannel
	default:
		return SourceRef{}, ErrUnsupportedSource
	}
	return ref, nil
}

// IsMix reports whether the playlist is an auto-generated YouTube mix/radio.
func (r SourceRef) IsMix() bool {
	return strings.HasPrefix(r.PlaylistID, "RD")
}

// ResolveDownload decides whether the reference is downloaded as a single track or a playlist.
// Ambiguous links default to the playlist, except auto-generated mixes which default to the track.
func (r SourceRef) ResolveDownload(mode DownloadMode) (SourceRef, error) {
	switch mode {
	case ModeDefault, ModeTrack, ModePlaylist:
	default:
		return SourceRef{}, ErrInvalidDownloadMode
	}

	switch r.Kind {
	case KindTrack:
		if mode == ModePlaylist {
			return SourceRef{}, ErrInvalidDownloadMode
		}
		return r, nil
	case KindPlaylist:
		if mode == ModeTrack {
			return SourceRef{}, ErrInvalidDownloadMode
		}
		return r, nil
	case KindTrackInPlaylist:
		asPlaylist := mode == ModePlaylist || (mode == ModeDefault && !r.IsMix())
		resolved := r
		if asPlaylist {
			resolved.Kind = KindPlaylist
			if !r.IsMix() {
				// Mixes only resolve through watch?v=...&list=RD..., so the seed video is kept.
				resolved.VideoID = ""
			}
		} else {
			resolved.Kind = KindTrack
			resolved.PlaylistID = ""
		}
		return resolved, nil
	default:
		return SourceRef{}, ErrUnsupportedSource
	}
}

// CanonicalURL rebuilds a clean URL from validated IDs only.
func (r SourceRef) CanonicalURL() string {
	host := "www.youtube.com"
	if r.Music {
		host = "music.youtube.com"
	}
	u := url.URL{Scheme: "https", Host: host}
	q := url.Values{}

	switch r.Kind {
	case KindTrack:
		u.Path = "/watch"
		q.Set("v", r.VideoID)
	case KindPlaylist:
		if r.VideoID != "" {
			u.Path = "/watch"
			q.Set("v", r.VideoID)
		} else {
			u.Path = "/playlist"
		}
		q.Set("list", r.PlaylistID)
	case KindTrackInPlaylist:
		u.Path = "/watch"
		q.Set("v", r.VideoID)
		q.Set("list", r.PlaylistID)
	case KindChannel:
		u.Host = "www.youtube.com"
		if strings.HasPrefix(r.ChannelID, "@") {
			u.Path = "/" + r.ChannelID
		} else {
			u.Path = "/channel/" + r.ChannelID
		}
	}
	u.RawQuery = q.Encode()
	return u.String()
}

// ParseDownloadURL re-reads a canonical URL stored by NewDownloadJob. A canonical URL only
// keeps both v= and list= for mixes resolved as playlists, so that combination means playlist.
func ParseDownloadURL(canonicalURL string) (SourceRef, error) {
	ref, err := ParseSourceURL(canonicalURL)
	if err != nil {
		return SourceRef{}, err
	}
	if ref.Kind == KindTrackInPlaylist {
		return ref.ResolveDownload(ModePlaylist)
	}
	return ref.ResolveDownload(ModeDefault)
}

// NewSourceRef builds a reference from the structured payload the discovery UI sends
// (RF8.1), validating provider, kind and id without ever parsing a user URL.
func NewSourceRef(provider, kind, id string) (SourceRef, error) {
	if SourceProvider(strings.ToLower(strings.TrimSpace(provider))) != ProviderYouTube {
		return SourceRef{}, ErrInvalidProvider
	}

	cleanID := strings.TrimSpace(id)
	switch SourceKind(strings.ToLower(strings.TrimSpace(kind))) {
	case KindTrack:
		if !videoIDPattern.MatchString(cleanID) {
			return SourceRef{}, ErrInvalidSourceID
		}
		return SourceRef{Provider: ProviderYouTube, Kind: KindTrack, VideoID: cleanID}, nil
	case KindPlaylist:
		if !playlistIDPattern.MatchString(cleanID) {
			return SourceRef{}, ErrInvalidSourceID
		}
		return SourceRef{Provider: ProviderYouTube, Kind: KindPlaylist, PlaylistID: cleanID}, nil
	default:
		return SourceRef{}, ErrInvalidSourceKind
	}
}

// filenameSourceIDPattern matches the "[<id>]" suffix produced by the yt-dlp output template.
var filenameSourceIDPattern = regexp.MustCompile(`\[([A-Za-z0-9_-]{11})\](?:\.[A-Za-z0-9]+)?$`)

// SourceIDFromFilename recovers the YouTube video id already embedded in downloaded
// filenames, which backfills tracks.source_id during a library scan.
func SourceIDFromFilename(path string) string {
	base := path
	if idx := strings.LastIndexAny(base, `/\`); idx >= 0 {
		base = base[idx+1:]
	}
	match := filenameSourceIDPattern.FindStringSubmatch(base)
	if match == nil {
		return ""
	}
	return match[1]
}
