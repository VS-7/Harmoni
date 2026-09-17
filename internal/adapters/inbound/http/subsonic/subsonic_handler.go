package subsonic

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/ports"
)

type Handler struct {
	subsonicUC ports.SubsonicUseCase
	trackUC    ports.TrackUseCase
}

func NewHandler(subsonicUC ports.SubsonicUseCase, trackUC ports.TrackUseCase) *Handler {
	return &Handler{
		subsonicUC: subsonicUC,
		trackUC:    trackUC,
	}
}

// verifyAuth checks Subsonic authentication parameters.
func (h *Handler) verifyAuth(r *http.Request) bool {
	u := r.URL.Query().Get("u")
	t := r.URL.Query().Get("t")
	s := r.URL.Query().Get("s")

	// Allow ping without strict auth if requested by clients or verify credentials
	if u == "" && t == "" {
		return false
	}

	ok, err := h.subsonicUC.Authenticate(r.Context(), u, t, s)
	return err == nil && ok
}

func (h *Handler) Ping(w http.ResponseWriter, r *http.Request) {
	// Subsonic clients use ping.view to test connectivity
	RespondSubsonic(w, r, SubsonicResponse{Status: "ok"})
}

func (h *Handler) GetArtists(w http.ResponseWriter, r *http.Request) {
	if !h.verifyAuth(r) {
		RespondSubsonicError(w, r, 40, "Wrong username or password")
		return
	}

	artists, err := h.subsonicUC.GetSubsonicArtists(r.Context())
	if err != nil {
		RespondSubsonicError(w, r, 0, "Failed to load artists")
		return
	}

	// Group artists by first letter index
	groups := make(map[string][]SubArtist)
	for _, a := range artists {
		letter := "#"
		if len(a.Name) > 0 {
			first := strings.ToUpper(string(a.Name[0]))
			if first >= "A" && first <= "Z" {
				letter = first
			}
		}
		groups[letter] = append(groups[letter], SubArtist{
			ID:   string(a.ID),
			Name: a.Name,
		})
	}

	var letters []string
	for k := range groups {
		letters = append(letters, k)
	}
	sort.Strings(letters)

	var indices []ArtistIndex
	for _, letter := range letters {
		indices = append(indices, ArtistIndex{
			Name:   letter,
			Artist: groups[letter],
		})
	}

	RespondSubsonic(w, r, SubsonicResponse{
		Status: "ok",
		Artists: &ArtistsWrapper{
			Index: indices,
		},
	})
}

func (h *Handler) GetArtist(w http.ResponseWriter, r *http.Request) {
	if !h.verifyAuth(r) {
		RespondSubsonicError(w, r, 40, "Wrong username or password")
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		RespondSubsonicError(w, r, 10, "Required parameter is missing: id")
		return
	}

	artist, albums, err := h.subsonicUC.GetSubsonicArtist(r.Context(), library.ArtistID(id))
	if err != nil {
		RespondSubsonicError(w, r, 70, "Artist not found")
		return
	}

	var subAlbums []SubAlbum
	for _, alb := range albums {
		subAlbums = append(subAlbums, SubAlbum{
			ID:       string(alb.ID),
			Name:     alb.Title,
			Artist:   artist.Name,
			ArtistID: string(artist.ID),
			Year:     alb.Year,
			CoverArt: string(alb.ID),
		})
	}

	RespondSubsonic(w, r, SubsonicResponse{
		Status: "ok",
		Artist: &ArtistDetail{
			ID:    string(artist.ID),
			Name:  artist.Name,
			Album: subAlbums,
		},
	})
}

func (h *Handler) GetAlbum(w http.ResponseWriter, r *http.Request) {
	if !h.verifyAuth(r) {
		RespondSubsonicError(w, r, 40, "Wrong username or password")
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		RespondSubsonicError(w, r, 10, "Required parameter is missing: id")
		return
	}

	album, tracks, err := h.subsonicUC.GetSubsonicAlbum(r.Context(), library.AlbumID(id))
	if err != nil {
		RespondSubsonicError(w, r, 70, "Album not found")
		return
	}

	var totalDuration int
	var subSongs []ChildSong
	for _, tr := range tracks {
		durSec := int(tr.Duration.Seconds())
		totalDuration += durSec
		subSongs = append(subSongs, toChildSong(tr))
	}

	RespondSubsonic(w, r, SubsonicResponse{
		Status: "ok",
		Album: &AlbumDetail{
			ID:        string(album.ID),
			Name:      album.Title,
			ArtistID:  string(album.ArtistID),
			SongCount: len(tracks),
			Duration:  totalDuration,
			Year:      album.Year,
			CoverArt:  string(album.ID),
			Song:      subSongs,
		},
	})
}

func (h *Handler) GetSong(w http.ResponseWriter, r *http.Request) {
	if !h.verifyAuth(r) {
		RespondSubsonicError(w, r, 40, "Wrong username or password")
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		RespondSubsonicError(w, r, 10, "Required parameter is missing: id")
		return
	}

	track, err := h.subsonicUC.GetSubsonicSong(r.Context(), library.TrackID(id))
	if err != nil {
		RespondSubsonicError(w, r, 70, "Song not found")
		return
	}

	RespondSubsonic(w, r, SubsonicResponse{
		Status: "ok",
		Song:   toChildSongPtr(*track),
	})
}

func (h *Handler) GetSimilarSongs(w http.ResponseWriter, r *http.Request) {
	if !h.verifyAuth(r) {
		RespondSubsonicError(w, r, 40, "Wrong username or password")
		return
	}

	id := r.URL.Query().Get("id")
	count, _ := strconv.Atoi(r.URL.Query().Get("count"))
	if count <= 0 {
		count = 20
	}

	tracks, err := h.subsonicUC.GetSimilarSongs(r.Context(), library.TrackID(id), count)
	if err != nil {
		RespondSubsonicError(w, r, 0, "Failed to get similar songs")
		return
	}

	var subSongs []ChildSong
	for _, tr := range tracks {
		subSongs = append(subSongs, toChildSong(tr))
	}

	RespondSubsonic(w, r, SubsonicResponse{
		Status: "ok",
		SimilarSongs: &SimilarSongs{
			Song: subSongs,
		},
	})
}

func (h *Handler) Stream(w http.ResponseWriter, r *http.Request) {
	if !h.verifyAuth(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	trackID := r.URL.Query().Get("id")
	if trackID == "" {
		http.Error(w, "Missing id", http.StatusBadRequest)
		return
	}

	res, err := h.trackUC.StreamTrack(r.Context(), library.TrackID(trackID))
	if err != nil {
		http.Error(w, "Audio not found", http.StatusNotFound)
		return
	}
	defer res.Content.Close()

	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("ETag", res.ETag)
	w.Header().Set("Content-Type", res.MIMEType)

	http.ServeContent(w, r, trackID, res.LastModified, res.Content)
}

func toChildSong(t library.Track) ChildSong {
	durSec := int(t.Duration.Seconds())
	var albIDStr string
	if t.AlbumID != nil {
		albIDStr = string(*t.AlbumID)
	}

	return ChildSong{
		ID:          string(t.ID),
		Title:       t.Title,
		Album:       t.AlbumTitle,
		AlbumID:     albIDStr,
		Artist:      t.ArtistName,
		ArtistID:    string(t.ArtistID),
		Track:       t.TrackNumber,
		Duration:    durSec,
		Size:        t.FileSize,
		ContentType: t.FileFormat.MIMEType(),
		Suffix:      string(t.FileFormat),
		BitRate:     t.Bitrate,
		Genre:       t.Genre,
		CoverArt:    fmt.Sprintf("cover-%s", t.ID),
		Type:        "music",
	}
}

func toChildSongPtr(t library.Track) *ChildSong {
	cs := toChildSong(t)
	return &cs
}
