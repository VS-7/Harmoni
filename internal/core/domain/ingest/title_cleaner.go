package ingest

import (
	"regexp"
	"strings"
)

// noiseSegmentPattern matches the promotional segments YouTube titles carry inside
// brackets or parentheses: "(Official Video)", "[4K]", "(Clipe Oficial)", "(Lyrics)".
// Only segments made entirely of noise words are dropped, so "(Ao Vivo)" or
// "(feat. Alguém)" survive: they are part of the song, not of the upload.
var noiseSegmentPattern = regexp.MustCompile(`(?i)\s*[\(\[\{]([^\)\]\}]*)[\)\]\}]`)

// noiseWords are the tokens that, alone or combined, make a segment disposable.
var noiseWords = map[string]bool{
	"official": true, "oficial": true, "officiel": true,
	"video": true, "vídeo": true, "videoclipe": true, "videoclip": true,
	"clipe": true, "clip": true, "mv": true, "m/v": true,
	"audio": true, "áudio": true, "sound": true,
	"lyric": true, "lyrics": true, "letra": true, "legendado": true,
	"hd": true, "hq": true, "4k": true, "8k": true, "1080p": true, "720p": true,
	"remaster": true, "remastered": true, "remasterizado": true,
	"music": true, "música": true, "musica": true,
	"visualizer": true, "visualiser": true, "explicit": true,
	"full": true, "completo": true, "version": true, "versão": true,
	"new": true, "novo": true, "hq audio": true,
	"with": true, "com": true, "and": true, "e": true, "the": true, "do": true, "da": true, "de": true,
}

// trailingNoisePattern removes the same noise when it comes loose after a separator,
// e.g. "Song - Official Music Video".
var trailingNoisePattern = regexp.MustCompile(`(?i)\s*[-–—|]\s*((official|oficial)[^-–—|]*|(lyrics?|letra)|(hd|hq|4k|8k))\s*$`)

var whitespacePattern = regexp.MustCompile(`\s{2,}`)

// CleanTitle strips upload noise from a YouTube title before it is written to the
// file tags (RF8.6). It never returns an empty string: if every segment looks like
// noise, the original trimmed title is kept.
func CleanTitle(raw string) string {
	title := strings.TrimSpace(raw)
	if title == "" {
		return ""
	}

	cleaned := noiseSegmentPattern.ReplaceAllStringFunc(title, func(segment string) string {
		inner := noiseSegmentPattern.FindStringSubmatch(segment)
		if len(inner) < 2 || !isNoiseSegment(inner[1]) {
			return segment
		}
		return ""
	})

	// A title may end in several loose noise groups ("- Official Video - HD").
	for {
		trimmed := trailingNoisePattern.ReplaceAllString(cleaned, "")
		if trimmed == cleaned {
			break
		}
		cleaned = trimmed
	}

	cleaned = whitespacePattern.ReplaceAllString(cleaned, " ")
	cleaned = strings.TrimSpace(strings.Trim(strings.TrimSpace(cleaned), "-–—|·"))
	cleaned = strings.TrimSpace(cleaned)

	if cleaned == "" {
		return title
	}
	return cleaned
}

// isNoiseSegment reports whether every word of the segment is disposable.
func isNoiseSegment(inner string) bool {
	fields := strings.Fields(strings.ToLower(inner))
	if len(fields) == 0 {
		return false
	}
	for _, field := range fields {
		word := strings.Trim(field, ".,:;!?\"'")
		if word == "" {
			continue
		}
		if !noiseWords[word] {
			return false
		}
	}
	return true
}

// SplitArtistTitle separates "Artista - Música" when the uploader used that convention
// and no structured artist field came from YouTube Music. Returns empty strings when
// the title has no separator, so the caller keeps its own fallbacks.
func SplitArtistTitle(raw string) (artist string, title string) {
	cleaned := CleanTitle(raw)
	for _, sep := range []string{" - ", " – ", " — "} {
		if idx := strings.Index(cleaned, sep); idx > 0 {
			artist = strings.TrimSpace(cleaned[:idx])
			title = strings.TrimSpace(cleaned[idx+len(sep):])
			if artist != "" && title != "" {
				return artist, title
			}
		}
	}
	return "", cleaned
}
