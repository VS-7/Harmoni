package library_test

import (
	"testing"
	"time"

	"harmoni/internal/core/domain/library"
)

func TestNewTrackValidation(t *testing.T) {
	// Success case
	tr, err := library.NewTrack("t1", "Bohemian Rhapsody", "a1", 354*time.Second, "/music/queen/bohemian.mp3", 1024000, library.FormatMP3)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tr.Title != "Bohemian Rhapsody" {
		t.Errorf("expected title Bohemian Rhapsody, got %s", tr.Title)
	}

	// Zero or negative duration
	_, err = library.NewTrack("t1", "Test", "a1", 0, "/path", 100, library.FormatMP3)
	if err != library.ErrInvalidTrackDuration {
		t.Errorf("expected ErrInvalidTrackDuration, got %v", err)
	}

	// Empty title
	_, err = library.NewTrack("t1", "   ", "a1", 10*time.Second, "/path", 100, library.FormatMP3)
	if err != library.ErrEmptyTitle {
		t.Errorf("expected ErrEmptyTitle, got %v", err)
	}

	// Empty path
	_, err = library.NewTrack("t1", "Test", "a1", 10*time.Second, "", 100, library.FormatMP3)
	if err != library.ErrEmptyFilePath {
		t.Errorf("expected ErrEmptyFilePath, got %v", err)
	}
}

func TestNewAlbumAndArtistValidation(t *testing.T) {
	art, err := library.NewArtist("art1", "Queen")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if art.Name != "Queen" {
		t.Errorf("expected Queen, got %s", art.Name)
	}

	_, err = library.NewArtist("art1", "   ")
	if err != library.ErrEmptyArtistName {
		t.Errorf("expected ErrEmptyArtistName, got %v", err)
	}

	alb, err := library.NewAlbum("alb1", "art1", "A Night at the Opera", 1975, "/music/queen/cover.jpg")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if alb.Title != "A Night at the Opera" {
		t.Errorf("expected A Night at the Opera, got %s", alb.Title)
	}

	_, err = library.NewAlbum("alb1", "art1", "", 1975, "")
	if err != library.ErrEmptyAlbumTitle {
		t.Errorf("expected ErrEmptyAlbumTitle, got %v", err)
	}
}

func TestAudioFormatMIME(t *testing.T) {
	fmt, err := library.ParseAudioFormat("flac")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if fmt.MIMEType() != "audio/flac" {
		t.Errorf("expected audio/flac, got %s", fmt.MIMEType())
	}
}
