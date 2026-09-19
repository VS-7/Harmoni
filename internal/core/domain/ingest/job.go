package ingest

import (
	"strings"
	"time"
)

// MaxBatchItems caps POST /downloads/batch so one request cannot flood the queue.
const MaxBatchItems = 100

type DownloadJob struct {
	ID        string
	SourceURL string
	// Kind is always KindTrack or KindPlaylist: the ambiguity is resolved at creation.
	Kind         SourceKind
	Provider     SourceProvider
	SourceID     string
	Title        string
	ThumbnailURL string
	// PlaylistID is the Harmoni playlist created or updated for a playlist job (RF8.4).
	PlaylistID   *string
	Status       JobStatus
	ErrorMessage *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// NewDownloadJob validates a raw user link and stores its canonical URL, never the raw input.
func NewDownloadJob(id string, rawURL string, mode DownloadMode) (*DownloadJob, error) {
	ref, err := ParseSourceURL(rawURL)
	if err != nil {
		return nil, err
	}
	resolved, err := ref.ResolveDownload(mode)
	if err != nil {
		return nil, err
	}
	return NewDownloadJobFromRef(id, resolved)
}

// NewDownloadJobFromRef builds a job from an already resolved reference, which is what
// the discovery flow sends (RF8.1, {"source": {...}}).
func NewDownloadJobFromRef(id string, ref SourceRef) (*DownloadJob, error) {
	cleanID := strings.TrimSpace(id)
	if cleanID == "" {
		return nil, ErrEmptyJobID
	}
	if ref.Provider != ProviderYouTube {
		return nil, ErrInvalidProvider
	}

	var sourceID string
	switch ref.Kind {
	case KindTrack:
		sourceID = ref.VideoID
	case KindPlaylist:
		sourceID = ref.PlaylistID
	default:
		// track_in_playlist and channel must be resolved before reaching here.
		return nil, ErrInvalidSourceKind
	}
	if sourceID == "" {
		return nil, ErrInvalidSourceID
	}

	now := time.Now().UTC()
	return &DownloadJob{
		ID:        cleanID,
		SourceURL: ref.CanonicalURL(),
		Kind:      ref.Kind,
		Provider:  ref.Provider,
		SourceID:  sourceID,
		Status:    StatusQueued,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

// Ref rebuilds the reference stored in the job without re-parsing the URL string.
func (j *DownloadJob) Ref() SourceRef {
	ref := SourceRef{Provider: j.Provider, Kind: j.Kind}
	if j.Kind == KindPlaylist {
		ref.PlaylistID = j.SourceID
	} else {
		ref.VideoID = j.SourceID
	}
	return ref
}

// SetPreview stores the human readable title and cover shown in the queue (RF8.2).
func (j *DownloadJob) SetPreview(title, thumbnailURL string) {
	j.Title = strings.TrimSpace(title)
	j.ThumbnailURL = strings.TrimSpace(thumbnailURL)
	j.UpdatedAt = time.Now().UTC()
}

// LinkPlaylist records the Harmoni playlist this job filled (RF8.4).
func (j *DownloadJob) LinkPlaylist(playlistID string) {
	clean := strings.TrimSpace(playlistID)
	if clean == "" {
		return
	}
	j.PlaylistID = &clean
	j.UpdatedAt = time.Now().UTC()
}

func (j *DownloadJob) StartProcessing() error {
	if j.Status != StatusQueued {
		return ErrInvalidStatusOrder
	}
	j.Status = StatusProcessing
	j.UpdatedAt = time.Now().UTC()
	return nil
}

func (j *DownloadJob) Complete() error {
	if j.Status != StatusProcessing {
		return ErrInvalidStatusOrder
	}
	j.Status = StatusCompleted
	j.ErrorMessage = nil
	j.UpdatedAt = time.Now().UTC()
	return nil
}

func (j *DownloadJob) Fail(errMsg string) error {
	if j.Status.IsTerminal() {
		return ErrInvalidStatusOrder
	}
	j.Status = StatusFailed
	cleanMsg := strings.TrimSpace(errMsg)
	j.ErrorMessage = &cleanMsg
	j.UpdatedAt = time.Now().UTC()
	return nil
}

// Cancel stops a job that has not finished yet (RF8.3).
func (j *DownloadJob) Cancel() error {
	if j.Status.IsTerminal() {
		return ErrInvalidStatusOrder
	}
	j.Status = StatusCanceled
	j.UpdatedAt = time.Now().UTC()
	return nil
}

// Requeue sends a failed or canceled job back to the queue (RF8.3, retry).
func (j *DownloadJob) Requeue() error {
	switch j.Status {
	case StatusFailed, StatusCanceled:
		j.Status = StatusQueued
		j.ErrorMessage = nil
		j.UpdatedAt = time.Now().UTC()
		return nil
	default:
		return ErrInvalidStatusOrder
	}
}
