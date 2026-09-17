package library

import (
	"fmt"
	"strings"
)

type TrackID string

func (t TrackID) String() string {
	return string(t)
}

type AlbumID string

func (a AlbumID) String() string {
	return string(a)
}

type ArtistID string

func (a ArtistID) String() string {
	return string(a)
}

type AudioFormat string

const (
	FormatMP3  AudioFormat = "mp3"
	FormatFLAC AudioFormat = "flac"
	FormatM4A  AudioFormat = "m4a"
	FormatOpus AudioFormat = "opus"
	FormatOGG  AudioFormat = "ogg"
	FormatWAV  AudioFormat = "wav"
	FormatAAC  AudioFormat = "aac"
)

func ParseAudioFormat(ext string) (AudioFormat, error) {
	clean := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(ext), "."))
	switch clean {
	case "mp3":
		return FormatMP3, nil
	case "flac":
		return FormatFLAC, nil
	case "m4a":
		return FormatM4A, nil
	case "opus":
		return FormatOpus, nil
	case "ogg":
		return FormatOGG, nil
	case "wav":
		return FormatWAV, nil
	case "aac":
		return FormatAAC, nil
	default:
		return AudioFormat(clean), fmt.Errorf("formato de áudio não suportado: %s", clean)
	}
}

func (f AudioFormat) MIMEType() string {
	switch f {
	case FormatMP3:
		return "audio/mpeg"
	case FormatFLAC:
		return "audio/flac"
	case FormatM4A, FormatAAC:
		return "audio/mp4"
	case FormatOpus:
		return "audio/opus"
	case FormatOGG:
		return "audio/ogg"
	case FormatWAV:
		return "audio/wav"
	default:
		return "application/octet-stream"
	}
}
