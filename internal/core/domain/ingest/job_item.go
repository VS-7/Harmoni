package ingest

import (
	"strings"
	"time"
)

// ItemStatus is the lifecycle of a single video inside a download job (RF8.2).
type ItemStatus string

const (
	ItemQueued     ItemStatus = "queued"
	ItemProcessing ItemStatus = "processing"
	ItemCompleted  ItemStatus = "completed"
	ItemFailed     ItemStatus = "failed"
	ItemSkipped    ItemStatus = "skipped"
	ItemCanceled   ItemStatus = "canceled"
)

func (s ItemStatus) IsTerminal() bool {
	switch s {
	case ItemCompleted, ItemFailed, ItemSkipped, ItemCanceled:
		return true
	default:
		return false
	}
}

// JobItem is one video of a job. A playlist job is expanded into one item per entry,
// so the worker can report real progress and survive an isolated failure.
type JobItem struct {
	ID           string
	JobID        string
	Position     int
	SourceID     string
	Title        string
	Status       ItemStatus
	TrackID      *string
	ErrorMessage *string
	UpdatedAt    time.Time
}

// NewJobItem validates the source id against the same pattern used for links.
func NewJobItem(id, jobID string, position int, sourceID, title string) (*JobItem, error) {
	cleanID := strings.TrimSpace(id)
	cleanJobID := strings.TrimSpace(jobID)
	if cleanID == "" || cleanJobID == "" {
		return nil, ErrEmptyJobID
	}
	cleanSourceID := strings.TrimSpace(sourceID)
	if !videoIDPattern.MatchString(cleanSourceID) {
		return nil, ErrInvalidSourceID
	}
	if position < 0 {
		return nil, ErrInvalidItemPosition
	}

	return &JobItem{
		ID:        cleanID,
		JobID:     cleanJobID,
		Position:  position,
		SourceID:  cleanSourceID,
		Title:     strings.TrimSpace(title),
		Status:    ItemQueued,
		UpdatedAt: time.Now().UTC(),
	}, nil
}

// Ref rebuilds the canonical track reference, so only validated ids reach yt-dlp.
func (i *JobItem) Ref() SourceRef {
	return SourceRef{Provider: ProviderYouTube, Kind: KindTrack, VideoID: i.SourceID}
}

func (i *JobItem) StartProcessing() error {
	if i.Status != ItemQueued {
		return ErrInvalidStatusOrder
	}
	i.Status = ItemProcessing
	i.UpdatedAt = time.Now().UTC()
	return nil
}

// Complete links the item to the indexed track. An empty trackID is still a success:
// the file was downloaded but the scan has not indexed it yet.
func (i *JobItem) Complete(trackID string) error {
	if i.Status != ItemProcessing {
		return ErrInvalidStatusOrder
	}
	i.Status = ItemCompleted
	if clean := strings.TrimSpace(trackID); clean != "" {
		i.TrackID = &clean
	}
	i.ErrorMessage = nil
	i.UpdatedAt = time.Now().UTC()
	return nil
}

func (i *JobItem) Fail(errMsg string) error {
	if i.Status.IsTerminal() {
		return ErrInvalidStatusOrder
	}
	i.Status = ItemFailed
	cleanMsg := strings.TrimSpace(errMsg)
	i.ErrorMessage = &cleanMsg
	i.UpdatedAt = time.Now().UTC()
	return nil
}

// Skip marks an entry that is already in the library and needs no download.
func (i *JobItem) Skip(trackID string) error {
	if i.Status.IsTerminal() {
		return ErrInvalidStatusOrder
	}
	i.Status = ItemSkipped
	if clean := strings.TrimSpace(trackID); clean != "" {
		i.TrackID = &clean
	}
	i.UpdatedAt = time.Now().UTC()
	return nil
}

func (i *JobItem) Cancel() error {
	if i.Status.IsTerminal() {
		return ErrInvalidStatusOrder
	}
	i.Status = ItemCanceled
	i.UpdatedAt = time.Now().UTC()
	return nil
}

// Requeue puts an unfinished item back in line (RF8.3, retry). ItemProcessing is
// included because a retry only runs on a job no worker is holding any more, so an item
// still marked as processing is a leftover from a restart, not live work.
func (i *JobItem) Requeue() error {
	switch i.Status {
	case ItemFailed, ItemCanceled, ItemProcessing:
		i.Status = ItemQueued
		i.ErrorMessage = nil
		i.UpdatedAt = time.Now().UTC()
		return nil
	default:
		return ErrInvalidStatusOrder
	}
}

// JobProgress is the per-job aggregate shown in the downloads queue (RF8.2).
type JobProgress struct {
	Total  int `json:"total_items"`
	Done   int `json:"done_items"`
	Failed int `json:"failed_items"`
}

// NewJobProgress derives the aggregate from the item list.
func NewJobProgress(items []JobItem) JobProgress {
	p := JobProgress{Total: len(items)}
	for _, item := range items {
		switch item.Status {
		case ItemCompleted, ItemSkipped:
			p.Done++
		case ItemFailed:
			p.Failed++
		}
	}
	return p
}
