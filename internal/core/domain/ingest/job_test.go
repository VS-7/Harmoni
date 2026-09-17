package ingest_test

import (
	"errors"
	"testing"

	"harmoni/internal/core/domain/ingest"
)

func TestJobStateMachineTransitions(t *testing.T) {
	job, err := ingest.NewDownloadJob("job-1", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", ingest.ModeDefault)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if job.Status != ingest.StatusQueued {
		t.Errorf("expected status queued, got %s", job.Status)
	}

	// Complete directly from queued should fail
	err = job.Complete()
	if err != ingest.ErrInvalidStatusOrder {
		t.Errorf("expected ErrInvalidStatusOrder, got %v", err)
	}

	// Queued -> Processing
	err = job.StartProcessing()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if job.Status != ingest.StatusProcessing {
		t.Errorf("expected status processing, got %s", job.Status)
	}

	// Processing -> Completed
	err = job.Complete()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if job.Status != ingest.StatusCompleted {
		t.Errorf("expected status completed, got %s", job.Status)
	}

	// Completed -> Processing should fail (terminal state)
	err = job.StartProcessing()
	if err != ingest.ErrInvalidStatusOrder {
		t.Errorf("expected ErrInvalidStatusOrder, got %v", err)
	}
}

func TestNewDownloadJobStoresCanonicalURL(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		mode ingest.DownloadMode
		want string
	}{
		{
			name: "link de playlist com faixa baixa a playlist por padrão",
			raw:  "https://www.youtube.com/watch?v=lBDDMrUCz1A&list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6",
			want: "https://www.youtube.com/playlist?list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6",
		},
		{
			name: "link de playlist com faixa em modo faixa",
			raw:  "https://www.youtube.com/watch?v=lBDDMrUCz1A&list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6",
			mode: ingest.ModeTrack,
			want: "https://www.youtube.com/watch?v=lBDDMrUCz1A",
		},
		{
			name: "parâmetros extras são descartados",
			raw:  "https://youtu.be/lBDDMrUCz1A?si=abc&t=42",
			want: "https://www.youtube.com/watch?v=lBDDMrUCz1A",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			job, err := ingest.NewDownloadJob("job-1", tt.raw, tt.mode)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if job.SourceURL != tt.want {
				t.Errorf("SourceURL = %q, want %q", job.SourceURL, tt.want)
			}
		})
	}
}

func TestNewDownloadJobRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		raw  string
		mode ingest.DownloadMode
		want error
	}{
		{"https://youtube.com/watch?v=123; rm -rf /", ingest.ModeDefault, ingest.ErrUnsafeURL},
		{"https://youtube.com/watch?v=$(id)", ingest.ModeDefault, ingest.ErrInvalidSourceID},
		{"https://youtube.com/watch?v=`whoami`", ingest.ModeDefault, ingest.ErrInvalidSourceID},
		{"https://www.youtube.com/@artista", ingest.ModeDefault, ingest.ErrUnsupportedSource},
		{"https://www.youtube.com/watch?v=lBDDMrUCz1A", ingest.ModePlaylist, ingest.ErrInvalidDownloadMode},
		{"https://www.youtube.com/watch?v=lBDDMrUCz1A", "album", ingest.ErrInvalidDownloadMode},
		{"", ingest.ModeDefault, ingest.ErrInvalidURL},
	}
	for _, tt := range tests {
		_, err := ingest.NewDownloadJob("job-1", tt.raw, tt.mode)
		if !errors.Is(err, tt.want) {
			t.Errorf("NewDownloadJob(%q, %q) error = %v, want %v", tt.raw, tt.mode, err, tt.want)
		}
	}
}
