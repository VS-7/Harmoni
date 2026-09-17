package filesystem_test

import (
	"os"
	"path/filepath"
	"testing"

	"harmoni/internal/adapters/outbound/filesystem"
)

func TestAudioStorageDirectoryTraversalPrevention(t *testing.T) {
	tempDir := t.TempDir()
	storage, err := filesystem.NewAudioStorage(tempDir)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}

	// Legitimate path inside root
	validPath := filepath.Join(tempDir, "song.mp3")
	if err := os.WriteFile(validPath, []byte("audio-bytes"), 0644); err != nil {
		t.Fatalf("failed to create dummy file: %v", err)
	}

	clean, err := storage.CleanPath(validPath)
	if err != nil {
		t.Fatalf("expected valid path to pass, got error: %v", err)
	}
	if clean != validPath {
		t.Errorf("expected %s, got %s", validPath, clean)
	}

	// Traversal attacks (Guardrail 5)
	traversalAttempts := []string{
		"../../../../etc/passwd",
		filepath.Join(tempDir, "../outside.mp3"),
		"/etc/shadow",
		"/tmp/evil.mp3",
	}

	for _, attempt := range traversalAttempts {
		_, err := storage.CleanPath(attempt)
		if err != filesystem.ErrDirectoryTraversal {
			t.Errorf("expected ErrDirectoryTraversal for %s, got %v", attempt, err)
		}
	}
}

func TestOpenAudioAndStat(t *testing.T) {
	tempDir := t.TempDir()
	storage, err := filesystem.NewAudioStorage(tempDir)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}

	content := []byte("audio-stream-content")
	filePath := filepath.Join(tempDir, "track.mp3")
	if err := os.WriteFile(filePath, content, 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	reader, size, err := storage.OpenAudio(filePath)
	if err != nil {
		t.Fatalf("failed to open audio: %v", err)
	}
	defer reader.Close()

	if size != int64(len(content)) {
		t.Errorf("expected size %d, got %d", len(content), size)
	}

	statSize, _, err := storage.Stat(filePath)
	if err != nil || statSize != int64(len(content)) {
		t.Errorf("stat mismatch: size=%d, err=%v", statSize, err)
	}
}
