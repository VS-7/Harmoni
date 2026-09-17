package ingest

import (
	"strings"
	"time"
)

type DownloadJob struct {
	ID           string
	SourceURL    string
	Status       JobStatus
	ErrorMessage *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// NewDownloadJob validates the link and stores its canonical URL, never the raw user input.
func NewDownloadJob(id string, rawURL string, mode DownloadMode) (*DownloadJob, error) {
	cleanID := strings.TrimSpace(id)
	if cleanID == "" {
		return nil, ErrEmptyJobID
	}

	ref, err := ParseSourceURL(rawURL)
	if err != nil {
		return nil, err
	}
	resolved, err := ref.ResolveDownload(mode)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	return &DownloadJob{
		ID:        cleanID,
		SourceURL: resolved.CanonicalURL(),
		Status:    StatusQueued,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
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
