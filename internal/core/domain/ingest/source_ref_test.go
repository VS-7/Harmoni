package ingest_test

import (
	"errors"
	"testing"

	"harmoni/internal/core/domain/ingest"
)

func TestParseSourceURL(t *testing.T) {
	tests := []struct {
		raw        string
		kind       ingest.SourceKind
		videoID    string
		playlistID string
		channelID  string
		music      bool
	}{
		{"https://www.youtube.com/watch?v=lBDDMrUCz1A&list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6", ingest.KindTrackInPlaylist, "lBDDMrUCz1A", "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6", "", false},
		{"https://www.youtube.com/watch?v=lBDDMrUCz1A&list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6&index=3&pp=iAQB", ingest.KindTrackInPlaylist, "lBDDMrUCz1A", "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6", "", false},
		{"https://www.youtube.com/playlist?list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6", ingest.KindPlaylist, "", "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6", "", false},
		{"https://music.youtube.com/playlist?list=OLAK5uy_kDcJfZ3Qx8j4Jgw5bXcS1vN2mP0aL9rTe", ingest.KindPlaylist, "", "OLAK5uy_kDcJfZ3Qx8j4Jgw5bXcS1vN2mP0aL9rTe", "", true},
		{"https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share", ingest.KindTrack, "dQw4w9WgXcQ", "", "", true},
		{"https://youtu.be/dQw4w9WgXcQ?si=xyz", ingest.KindTrack, "dQw4w9WgXcQ", "", "", false},
		{"https://m.youtube.com/watch?v=dQw4w9WgXcQ", ingest.KindTrack, "dQw4w9WgXcQ", "", "", false},
		{"https://youtube.com/shorts/dQw4w9WgXcQ", ingest.KindTrack, "dQw4w9WgXcQ", "", "", false},
		{"  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ", ingest.KindTrack, "dQw4w9WgXcQ", "", "", false},
		{"https://www.youtube.com/@LegiaoUrbana", ingest.KindChannel, "", "", "@LegiaoUrbana", false},
		{"https://www.youtube.com/channel/UC1234567890abcdefghijkl", ingest.KindChannel, "", "", "UC1234567890abcdefghijkl", false},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			ref, err := ingest.ParseSourceURL(tt.raw)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if ref.Kind != tt.kind || ref.VideoID != tt.videoID || ref.PlaylistID != tt.playlistID ||
				ref.ChannelID != tt.channelID || ref.Music != tt.music {
				t.Errorf("got %+v", ref)
			}
		})
	}
}

func TestParseSourceURLRejects(t *testing.T) {
	tests := []struct {
		raw  string
		want error
	}{
		{"file:///etc/passwd", ingest.ErrInvalidURL},
		{"ftp://youtube.com/watch?v=dQw4w9WgXcQ", ingest.ErrInvalidURL},
		{"javascript:alert(1)", ingest.ErrInvalidURL},
		{"youtube.com/watch?v=dQw4w9WgXcQ", ingest.ErrInvalidURL},
		{"https://example.com/watch?v=dQw4w9WgXcQ", ingest.ErrUnsupportedSource},
		{"https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", ingest.ErrUnsupportedSource},
		{"https://soundcloud.com/artist/track", ingest.ErrUnsupportedSource},
		{"https://user@www.youtube.com/watch?v=dQw4w9WgXcQ", ingest.ErrUnsafeURL},
		{"https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ", ingest.ErrUnsafeURL},
		{"https://www.youtube.com/watch?v=dQw4w9WgXcQ\n--exec", ingest.ErrUnsafeURL},
		{"https://www.youtube.com/watch?v=--exec=id", ingest.ErrInvalidSourceID},
		{"https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL;rm", ingest.ErrUnsafeURL},
		{"https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL%3Brm-aaaaaaaa", ingest.ErrInvalidSourceID},
		{"https://www.youtube.com/watch?v=short", ingest.ErrInvalidSourceID},
		{"https://www.youtube.com/", ingest.ErrUnsupportedSource},
		{"https://www.youtube.com/results?search_query=teste", ingest.ErrUnsupportedSource},
	}
	for _, tt := range tests {
		_, err := ingest.ParseSourceURL(tt.raw)
		if !errors.Is(err, tt.want) {
			t.Errorf("ParseSourceURL(%q) error = %v, want %v", tt.raw, err, tt.want)
		}
	}
}

func TestResolveDownloadAndCanonicalRoundTrip(t *testing.T) {
	tests := []struct {
		name      string
		raw       string
		mode      ingest.DownloadMode
		wantURL   string
		wantKind  ingest.SourceKind
		wantIsMix bool
	}{
		{
			name:     "playlist comum",
			raw:      "https://www.youtube.com/watch?v=lBDDMrUCz1A&list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6",
			wantURL:  "https://www.youtube.com/playlist?list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6",
			wantKind: ingest.KindPlaylist,
		},
		{
			name:     "mix vira faixa por padrão",
			raw:      "https://www.youtube.com/watch?v=lBDDMrUCz1A&list=RDlBDDMrUCz1A&start_radio=1",
			wantURL:  "https://www.youtube.com/watch?v=lBDDMrUCz1A",
			wantKind: ingest.KindTrack,
		},
		{
			name:      "mix como playlist mantém o vídeo semente",
			raw:       "https://www.youtube.com/watch?v=lBDDMrUCz1A&list=RDlBDDMrUCz1A",
			mode:      ingest.ModePlaylist,
			wantURL:   "https://www.youtube.com/watch?list=RDlBDDMrUCz1A&v=lBDDMrUCz1A",
			wantKind:  ingest.KindPlaylist,
			wantIsMix: true,
		},
		{
			name:     "youtube music preserva o host",
			raw:      "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=OLAK5uy_kDcJfZ3Qx8j4Jgw5bXcS1vN2mP0aL9rTe",
			wantURL:  "https://music.youtube.com/playlist?list=OLAK5uy_kDcJfZ3Qx8j4Jgw5bXcS1vN2mP0aL9rTe",
			wantKind: ingest.KindPlaylist,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ref, err := ingest.ParseSourceURL(tt.raw)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			resolved, err := ref.ResolveDownload(tt.mode)
			if err != nil {
				t.Fatalf("resolve: %v", err)
			}
			got := resolved.CanonicalURL()
			if got != tt.wantURL {
				t.Fatalf("CanonicalURL = %q, want %q", got, tt.wantURL)
			}

			// The worker only has the stored URL, so it must recover the same decision.
			back, err := ingest.ParseDownloadURL(got)
			if err != nil {
				t.Fatalf("ParseDownloadURL: %v", err)
			}
			if back.Kind != tt.wantKind || back.IsMix() != tt.wantIsMix {
				t.Errorf("round trip got kind=%s mix=%v, want kind=%s mix=%v", back.Kind, back.IsMix(), tt.wantKind, tt.wantIsMix)
			}
		})
	}
}
