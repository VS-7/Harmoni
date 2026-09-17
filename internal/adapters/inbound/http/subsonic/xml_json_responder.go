package subsonic

import (
	"encoding/json"
	"encoding/xml"
	"net/http"
	"strings"
)

type SubsonicResponse struct {
	XMLName       xml.Name      `xml:"subsonic-response" json:"-"`
	XMLNS         string        `xml:"xmlns,attr" json:"-"`
	Status        string        `xml:"status,attr" json:"status"`
	Version       string        `xml:"version,attr" json:"version"`
	Type          string        `xml:"type,attr" json:"type"`
	ServerVersion string        `xml:"serverVersion,attr" json:"serverVersion"`
	OpenSubsonic  bool          `xml:"openSubsonic,attr" json:"openSubsonic"`
	Error         *SubsonicError `xml:"error,omitempty" json:"error,omitempty"`
	Artists       *ArtistsWrapper `xml:"artists,omitempty" json:"artists,omitempty"`
	Artist        *ArtistDetail  `xml:"artist,omitempty" json:"artist,omitempty"`
	Album         *AlbumDetail   `xml:"album,omitempty" json:"album,omitempty"`
	Song          *ChildSong     `xml:"song,omitempty" json:"song,omitempty"`
	SimilarSongs  *SimilarSongs  `xml:"similarSongs,omitempty" json:"similarSongs,omitempty"`
}

type SubsonicError struct {
	Code    int    `xml:"code,attr" json:"code"`
	Message string `xml:"message,attr" json:"message"`
}

type ArtistsWrapper struct {
	Index []ArtistIndex `xml:"index" json:"index"`
}

type ArtistIndex struct {
	Name   string       `xml:"name,attr" json:"name"`
	Artist []SubArtist `xml:"artist" json:"artist"`
}

type SubArtist struct {
	ID        string `xml:"id,attr" json:"id"`
	Name      string `xml:"name,attr" json:"name"`
	AlbumCount int   `xml:"albumCount,attr,omitempty" json:"albumCount,omitempty"`
}

type ArtistDetail struct {
	ID    string     `xml:"id,attr" json:"id"`
	Name  string     `xml:"name,attr" json:"name"`
	Album []SubAlbum `xml:"album" json:"album"`
}

type SubAlbum struct {
	ID        string `xml:"id,attr" json:"id"`
	Name      string `xml:"name,attr" json:"name"`
	Artist    string `xml:"artist,attr" json:"artist"`
	ArtistID  string `xml:"artistId,attr" json:"artistId"`
	SongCount int    `xml:"songCount,attr" json:"songCount"`
	Duration  int    `xml:"duration,attr" json:"duration"`
	Year      int    `xml:"year,attr,omitempty" json:"year,omitempty"`
	CoverArt  string `xml:"coverArt,attr,omitempty" json:"coverArt,omitempty"`
}

type AlbumDetail struct {
	ID        string      `xml:"id,attr" json:"id"`
	Name      string      `xml:"name,attr" json:"name"`
	Artist    string      `xml:"artist,attr" json:"artist"`
	ArtistID  string      `xml:"artistId,attr" json:"artistId"`
	SongCount int         `xml:"songCount,attr" json:"songCount"`
	Duration  int         `xml:"duration,attr" json:"duration"`
	Year      int         `xml:"year,attr,omitempty" json:"year,omitempty"`
	CoverArt  string      `xml:"coverArt,attr,omitempty" json:"coverArt,omitempty"`
	Song      []ChildSong `xml:"song" json:"song"`
}

type ChildSong struct {
	ID          string `xml:"id,attr" json:"id"`
	Parent      string `xml:"parent,attr,omitempty" json:"parent,omitempty"`
	Title       string `xml:"title,attr" json:"title"`
	Album       string `xml:"album,attr,omitempty" json:"album,omitempty"`
	Artist      string `xml:"artist,attr,omitempty" json:"artist,omitempty"`
	Track       int    `xml:"track,attr,omitempty" json:"track,omitempty"`
	Year        int    `xml:"year,attr,omitempty" json:"year,omitempty"`
	Genre       string `xml:"genre,attr,omitempty" json:"genre,omitempty"`
	CoverArt    string `xml:"coverArt,attr,omitempty" json:"coverArt,omitempty"`
	Size        int64  `xml:"size,attr" json:"size"`
	ContentType string `xml:"contentType,attr" json:"contentType"`
	Suffix      string `xml:"suffix,attr" json:"suffix"`
	Duration    int    `xml:"duration,attr" json:"duration"`
	BitRate     int    `xml:"bitRate,attr,omitempty" json:"bitRate,omitempty"`
	Path        string `xml:"path,attr,omitempty" json:"path,omitempty"`
	AlbumID     string `xml:"albumId,attr,omitempty" json:"albumId,omitempty"`
	ArtistID    string `xml:"artistId,attr,omitempty" json:"artistId,omitempty"`
	Type        string `xml:"type,attr" json:"type"`
	IsVideo     bool   `xml:"isVideo,attr" json:"isVideo"`
}

type SimilarSongs struct {
	Song []ChildSong `xml:"song" json:"song"`
}

func RespondSubsonic(w http.ResponseWriter, r *http.Request, resp SubsonicResponse) {
	resp.XMLNS = "http://subsonic.org/restapi"
	resp.Version = "1.16.1"
	resp.Type = "harmoni"
	resp.ServerVersion = "1.0.0"
	resp.OpenSubsonic = true

	format := strings.ToLower(r.URL.Query().Get("f"))
	if format == "json" {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"subsonic-response": resp,
		})
		return
	}

	w.Header().Set("Content-Type", "text/xml; charset=utf-8")
	w.Write([]byte(xml.Header))
	_ = xml.NewEncoder(w).Encode(resp)
}

func RespondSubsonicError(w http.ResponseWriter, r *http.Request, code int, message string) {
	resp := SubsonicResponse{
		Status: "failed",
		Error: &SubsonicError{
			Code:    code,
			Message: message,
		},
	}
	RespondSubsonic(w, r, resp)
}
