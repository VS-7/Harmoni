package playlist

import (
	"strings"
	"time"
	"unicode/utf8"
)

// MaxNameLength matches the VARCHAR(255) columns of playlists and playlist_folders.
const MaxNameLength = 255

type FolderID string

// Folder groups playlists in the library sidebar. Deleting a folder never deletes the
// playlists inside it: they return to the root of the library.
type Folder struct {
	ID        FolderID  `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func NewFolder(id FolderID, name string) (*Folder, error) {
	cleanName, err := validateFolderName(name)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	return &Folder{
		ID:        id,
		Name:      cleanName,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

// Rename applies the same rules as NewFolder, so a folder can never end up nameless.
func (f *Folder) Rename(name string) error {
	cleanName, err := validateFolderName(name)
	if err != nil {
		return err
	}
	f.Name = cleanName
	f.UpdatedAt = time.Now().UTC()
	return nil
}

func validateFolderName(name string) (string, error) {
	cleanName := strings.TrimSpace(name)
	if cleanName == "" {
		return "", ErrInvalidFolderName
	}
	if utf8.RuneCountInString(cleanName) > MaxNameLength {
		return "", ErrNameTooLong
	}
	return cleanName, nil
}
