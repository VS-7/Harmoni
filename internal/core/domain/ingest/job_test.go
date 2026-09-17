package ingest_test

import (
	"testing"

	"harmoni/internal/core/domain/ingest"
)

func TestURLValidationAndSanitization(t *testing.T) {
	// Valid URL
	clean, err := ingest.ValidateAndSanitizeURL("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
	if err != nil {
		t.Fatalf("unexpected error for valid URL: %v", err)
	}
	if clean != "https://www.youtube.com/watch?v=dQw4w9WgXcQ" {
		t.Errorf("unexpected URL value: %s", clean)
	}

	// Shell command injection attempts
	injections := []string{
		"https://youtube.com/watch?v=123; rm -rf /",
		"https://youtube.com/watch?v=123 && echo hacked",
		"https://youtube.com/watch?v=123 | cat /etc/passwd",
		"https://youtube.com/watch?v=`whoami`",
		"https://youtube.com/watch?v=$(id)",
	}
	for _, inj := range injections {
		_, err := ingest.ValidateAndSanitizeURL(inj)
		if err != ingest.ErrUnsafeURL {
			t.Errorf("expected ErrUnsafeURL for %q, got %v", inj, err)
		}
	}

	// Invalid schemes
	invalidSchemes := []string{
		"file:///etc/passwd",
		"ftp://example.com/audio.mp3",
		"javascript:alert(1)",
	}
	for _, inv := range invalidSchemes {
		_, err := ingest.ValidateAndSanitizeURL(inv)
		if err != ingest.ErrInvalidURL {
			t.Errorf("expected ErrInvalidURL for %q, got %v", inv, err)
		}
	}
}

func TestJobStateMachineTransitions(t *testing.T) {
	job, err := ingest.NewDownloadJob("job-1", "https://example.com/audio")
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
