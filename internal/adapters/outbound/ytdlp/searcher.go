// Package ytdlp adapts the yt-dlp binary to the outbound ports. The search side runs
// flat (metadata only): no download, no ffmpeg, no transcoding (Guardrail 3).
package ytdlp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"harmoni/internal/core/domain/discovery"
	"harmoni/internal/core/domain/ingest"
)

// YouTube search filter parameters: sp=EgIQAw -> playlists, sp=EgIQAg -> channels.
const (
	filterPlaylists = "EgIQAw%3D%3D"
	filterChannels  = "EgIQAg%3D%3D"
)

var (
	channelIDPattern = regexp.MustCompile(`^UC[A-Za-z0-9_-]{22}$`)
	videoIDPattern   = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
)

// commandRunner is the seam that lets the tests exercise the parsing without yt-dlp.
type commandRunner func(ctx context.Context, args []string) (string, error)

// Searcher implements ports.RemoteSearcher, RemotePlaylistReader, RemoteArtistReader
// and RemoteTrackReader on top of yt-dlp.
type Searcher struct {
	run commandRunner
}

func NewSearcher() *Searcher {
	return &Searcher{run: runYtDlp}
}

// runYtDlp executes yt-dlp through nice -n 19 (Guardrail 4) with no shell involved.
func runYtDlp(ctx context.Context, args []string) (string, error) {
	var stdout, stderr bytes.Buffer

	cmd := exec.CommandContext(ctx, "nice", append([]string{"-n", "19", "yt-dlp"}, args...)...)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// Partial output is still usable: with --ignore-errors yt-dlp exits non-zero
		// when a single entry is unavailable.
		if stdout.Len() > 0 {
			return stdout.String(), nil
		}
		return "", fmt.Errorf("%w: %s", err, lastErrorLine(stderr.String()))
	}
	return stdout.String(), nil
}

// Search runs the flat lookups for the requested kinds (RF7.1). For "all" the three
// lookups run concurrently: they are network-bound metadata calls, and doing them in
// sequence would break the 2.5 s target of RNF6. The DiscoveryService semaphore still
// allows a single search at a time, so the fan-out is bounded to one request.
func (s *Searcher) Search(ctx context.Context, query discovery.Query) ([]discovery.RemoteItem, error) {
	type lookup struct {
		kind discovery.Kind
		fn   func(context.Context, discovery.Query, int) ([]discovery.RemoteItem, error)
	}

	var lookups []lookup
	if query.Includes(discovery.KindTrack) {
		lookups = append(lookups, lookup{discovery.KindTrack, s.searchTracks})
	}
	if query.Includes(discovery.KindPlaylist) {
		lookups = append(lookups, lookup{discovery.KindPlaylist, s.searchPlaylists})
	}
	if query.Includes(discovery.KindArtist) {
		lookups = append(lookups, lookup{discovery.KindArtist, s.searchArtists})
	}

	// A combined search splits its budget, keeping the response small and fast.
	limit := query.Limit
	if len(lookups) > 1 {
		limit = query.Limit / 2
		if limit < 3 {
			limit = 3
		}
	}

	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		results = make(map[discovery.Kind][]discovery.RemoteItem, len(lookups))
		lastErr error
	)

	for _, l := range lookups {
		wg.Add(1)
		go func(l lookup) {
			defer wg.Done()
			items, err := l.fn(ctx, query, limit)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				slog.WarnContext(ctx, "busca remota parcial", "kind", string(l.kind), "err", err)
				lastErr = err
				return
			}
			results[l.kind] = items
		}(l)
	}
	wg.Wait()

	// Tracks first, then playlists, then artists: the order the search screen renders.
	var merged []discovery.RemoteItem
	for _, kind := range []discovery.Kind{discovery.KindTrack, discovery.KindPlaylist, discovery.KindArtist} {
		merged = append(merged, results[kind]...)
	}

	if len(merged) == 0 && lastErr != nil {
		return nil, fmt.Errorf("%w: %v", discovery.ErrRemoteUnavailable, lastErr)
	}
	return merged, nil
}

// searchTracks uses the native ytsearch pseudo-URL, which is the cheapest video lookup.
func (s *Searcher) searchTracks(ctx context.Context, query discovery.Query, limit int) ([]discovery.RemoteItem, error) {
	// The query is passed as a single argv element, never through a shell.
	target := "ytsearch" + strconv.Itoa(limit) + ":" + query.Text

	out, err := s.run(ctx, flatArgs(target))
	if err != nil {
		return nil, err
	}
	return s.parseEntries(ctx, out, discovery.KindTrack, limit), nil
}

func (s *Searcher) searchPlaylists(ctx context.Context, query discovery.Query, limit int) ([]discovery.RemoteItem, error) {
	return s.searchResultsPage(ctx, query, limit, filterPlaylists, discovery.KindPlaylist)
}

func (s *Searcher) searchArtists(ctx context.Context, query discovery.Query, limit int) ([]discovery.RemoteItem, error) {
	return s.searchResultsPage(ctx, query, limit, filterChannels, discovery.KindArtist)
}

// searchResultsPage reads the YouTube results page with a type filter. The text is
// percent-encoded before it becomes part of the URL (RNF8).
func (s *Searcher) searchResultsPage(
	ctx context.Context,
	query discovery.Query,
	limit int,
	filter string,
	kind discovery.Kind,
) ([]discovery.RemoteItem, error) {
	target := "https://www.youtube.com/results?search_query=" + url.QueryEscape(query.Text) + "&sp=" + filter

	out, err := s.run(ctx, flatArgs(target, "--playlist-end", strconv.Itoa(limit)))
	if err != nil {
		return nil, err
	}
	return s.parseEntries(ctx, out, kind, limit), nil
}

// GetTrack reads the metadata of a single video (RF6.2, preview of the link).
func (s *Searcher) GetTrack(ctx context.Context, videoID string) (*discovery.RemoteItem, error) {
	if !videoIDPattern.MatchString(videoID) {
		return nil, discovery.ErrRemoteNotFound
	}

	ref := ingest.SourceRef{Provider: ingest.ProviderYouTube, Kind: ingest.KindTrack, VideoID: videoID}
	args := []string{
		"--skip-download", "--no-playlist", "--dump-single-json",
		"--no-warnings", "--no-progress", "--", ref.CanonicalURL(),
	}

	out, err := s.run(ctx, args)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", discovery.ErrRemoteUnavailable, err)
	}

	var entry ytEntry
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &entry); err != nil {
		return nil, fmt.Errorf("%w: resposta inesperada do yt-dlp", discovery.ErrRemoteNotFound)
	}

	item := entry.toRemoteItem(discovery.KindTrack)
	if item.ID == "" {
		item.ID = videoID
	}
	return &item, nil
}

// GetPlaylist reads a remote playlist and its flat track list (RF7.2).
func (s *Searcher) GetPlaylist(ctx context.Context, playlistID string) (*discovery.RemotePlaylist, error) {
	ref, err := ingest.NewSourceRef(string(ingest.ProviderYouTube), string(ingest.KindPlaylist), playlistID)
	if err != nil {
		return nil, discovery.ErrInvalidPlaylistID
	}

	args := []string{
		"--flat-playlist", "--dump-single-json", "--no-warnings", "--no-progress", "--ignore-errors",
	}
	// A mix is endless, so only the first page is ever read (RF6.2).
	if ref.IsMix() {
		args = append(args, "--playlist-end", strconv.Itoa(ingest.MixPlaylistLimit))
	}
	args = append(args, "--", ref.CanonicalURL())

	out, err := s.run(ctx, args)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", discovery.ErrRemoteUnavailable, err)
	}

	var payload ytPlaylist
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &payload); err != nil {
		return nil, fmt.Errorf("%w: resposta inesperada do yt-dlp", discovery.ErrRemoteNotFound)
	}

	pl := &discovery.RemotePlaylist{
		ID:           ref.PlaylistID,
		Title:        strings.TrimSpace(payload.Title),
		Artist:       payload.artistName(),
		ThumbnailURL: payload.bestThumbnail(),
		ItemCount:    payload.PlaylistCount,
	}

	for _, entry := range payload.Entries {
		if !videoIDPattern.MatchString(entry.ID) {
			continue
		}
		pl.Tracks = append(pl.Tracks, entry.toRemoteItem(discovery.KindTrack))
	}
	if pl.ItemCount == 0 {
		pl.ItemCount = len(pl.Tracks)
	}
	if pl.ThumbnailURL == "" && len(pl.Tracks) > 0 {
		pl.ThumbnailURL = pl.Tracks[0].ThumbnailURL
	}

	slog.InfoContext(ctx, "playlist remota lida via yt-dlp", "playlist_id", pl.ID, "faixas", len(pl.Tracks))
	return pl, nil
}

// GetArtist reads the popular tracks and the releases of a channel (RF7.3). The two
// tabs are read concurrently for the same latency reason as the combined search.
func (s *Searcher) GetArtist(ctx context.Context, channelID string) (*discovery.RemoteArtist, error) {
	base, err := artistBaseURL(channelID)
	if err != nil {
		return nil, err
	}

	var (
		wg            sync.WaitGroup
		videos, lists ytPlaylist
		videosErr     error
	)

	wg.Add(2)
	go func() {
		defer wg.Done()
		videos, videosErr = s.readTab(ctx, base+"/videos", 20)
	}()
	go func() {
		defer wg.Done()
		// A missing /playlists tab is not an error: the artist simply has no releases.
		lists, _ = s.readTab(ctx, base+"/playlists", 20)
	}()
	wg.Wait()

	if videosErr != nil && len(lists.Entries) == 0 {
		return nil, fmt.Errorf("%w: %v", discovery.ErrRemoteUnavailable, videosErr)
	}

	artist := &discovery.RemoteArtist{
		ID:           channelID,
		Name:         firstNonEmpty(videos.artistName(), lists.artistName(), channelID),
		ThumbnailURL: firstNonEmpty(videos.bestThumbnail(), lists.bestThumbnail()),
	}

	for _, entry := range videos.Entries {
		if videoIDPattern.MatchString(entry.ID) {
			artist.TopTracks = append(artist.TopTracks, entry.toRemoteItem(discovery.KindTrack))
		}
	}
	for _, entry := range lists.Entries {
		if entry.ID != "" && !videoIDPattern.MatchString(entry.ID) {
			artist.Playlists = append(artist.Playlists, entry.toRemoteItem(discovery.KindPlaylist))
		}
	}

	if artist.ThumbnailURL == "" && len(artist.TopTracks) > 0 {
		artist.ThumbnailURL = artist.TopTracks[0].ThumbnailURL
	}
	return artist, nil
}

func (s *Searcher) readTab(ctx context.Context, tabURL string, limit int) (ytPlaylist, error) {
	args := []string{
		"--flat-playlist", "--dump-single-json", "--no-warnings", "--no-progress", "--ignore-errors",
		"--playlist-end", strconv.Itoa(limit), "--", tabURL,
	}

	out, err := s.run(ctx, args)
	if err != nil {
		return ytPlaylist{}, err
	}

	var payload ytPlaylist
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &payload); err != nil {
		return ytPlaylist{}, fmt.Errorf("resposta inesperada do yt-dlp para %s", tabURL)
	}
	return payload, nil
}

// parseEntries reads the one-JSON-object-per-line output of a flat search.
func (s *Searcher) parseEntries(ctx context.Context, stdout string, want discovery.Kind, limit int) []discovery.RemoteItem {
	var items []discovery.RemoteItem
	seen := make(map[string]bool)

	scanner := bufio.NewScanner(strings.NewReader(stdout))
	// Flat entries stay small, but a description can still exceed the default 64 KB.
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "{") {
			continue
		}

		var entry ytEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			slog.DebugContext(ctx, "linha ignorada na saída do yt-dlp", "err", err)
			continue
		}
		if entry.ID == "" || seen[entry.ID] || classify(entry.ID) != want {
			continue
		}

		seen[entry.ID] = true
		items = append(items, entry.toRemoteItem(want))
		if len(items) >= limit {
			break
		}
	}
	return items
}

// flatArgs are the flags shared by every metadata-only lookup (RF7.1). The target is
// always last: any extra flag has to come before "--", otherwise yt-dlp reads it as a URL.
func flatArgs(target string, extra ...string) []string {
	args := []string{
		"--flat-playlist",
		"--dump-json",
		"--no-warnings",
		"--no-progress",
		"--skip-download",
		"--ignore-errors",
	}
	args = append(args, extra...)
	// "--" ends option parsing so a target starting with "-" is never read as a flag.
	return append(args, "--", target)
}

// classify infers the kind from the id shape, which is more reliable than ie_key
// across yt-dlp versions.
func classify(id string) discovery.Kind {
	switch {
	case channelIDPattern.MatchString(id):
		return discovery.KindArtist
	case videoIDPattern.MatchString(id):
		return discovery.KindTrack
	case len(id) >= 12:
		return discovery.KindPlaylist
	default:
		return discovery.KindAll
	}
}

func artistBaseURL(channelID string) (string, error) {
	ref, err := ingest.ParseSourceURL("https://www.youtube.com/" + artistPath(channelID))
	if err != nil || ref.Kind != ingest.KindChannel {
		return "", discovery.ErrInvalidArtistID
	}
	return ref.CanonicalURL(), nil
}

func artistPath(channelID string) string {
	if strings.HasPrefix(channelID, "@") {
		return channelID
	}
	return "channel/" + channelID
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
