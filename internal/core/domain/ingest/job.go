package ingest

import (
	"net/url"
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

func ValidateAndSanitizeURL(rawURL string) (string, error) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return "", ErrInvalidURL
	}

	// Reject shell injection attempts (Guardrail 5)
	dangerousChars := []string{";", "&", "|", "`", "$", "<", ">", "\n", "\r", "\"", "'"}
	for _, char := range dangerousChars {
		if strings.Contains(trimmed, char) {
			return "", ErrUnsafeURL
		}
	}

	parsed, err := url.ParseRequestURI(trimmed)
	if err != nil {
		return "", ErrInvalidURL
	}

	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", ErrInvalidURL
	}

	if parsed.Host == "" {
		return "", ErrInvalidURL
	}

	return parsed.String(), nil
}

func NewDownloadJob(id string, rawURL string) (*DownloadJob, error) {
	cleanID := strings.TrimSpace(id)
	if cleanID == "" {
		return nil, ErrEmptyJobID
	}

	cleanURL, err := ValidateAndSanitizeURL(rawURL)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	return &DownloadJob{
		ID:        cleanID,
		SourceURL: cleanURL,
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
