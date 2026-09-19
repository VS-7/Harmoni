package ytdlp

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/ports"
)

// requestFor builds the validated request the worker sends, from a user-facing link.
func requestFor(t *testing.T, rawURL string, subDir string) ports.DownloadRequest {
	return requestForMode(t, rawURL, subDir, ingest.ModeDefault)
}

func requestForMode(t *testing.T, rawURL, subDir string, mode ingest.DownloadMode) ports.DownloadRequest {
	t.Helper()
	ref, err := ingest.ParseSourceURL(rawURL)
	if err != nil {
		t.Fatalf("url de teste inválida %q: %v", rawURL, err)
	}
	resolved, err := ref.ResolveDownload(mode)
	if err != nil {
		t.Fatalf("não foi possível resolver %q: %v", rawURL, err)
	}
	return ports.DownloadRequest{Ref: resolved, SubDir: subDir}
}

// fakeYtDlp installs a yt-dlp stub in PATH that records its arguments and runs body.
func fakeYtDlp(t *testing.T, body string) (argsFile string) {
	t.Helper()
	if _, err := exec.LookPath("nice"); err != nil {
		t.Skip("nice não disponível")
	}
	binDir := t.TempDir()
	argsFile = filepath.Join(binDir, "args.txt")
	script := "#!/bin/sh\nprintf '%s\\n' \"$@\" > " + argsFile + "\n" + body + "\n"
	if err := os.WriteFile(filepath.Join(binDir, "yt-dlp"), []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	return argsFile
}

func readArgs(t *testing.T, argsFile string) []string {
	t.Helper()
	data, err := os.ReadFile(argsFile)
	if err != nil {
		t.Fatal(err)
	}
	return strings.Split(strings.TrimSpace(string(data)), "\n")
}

func TestDownloadPlaylistReturnsExactFilesInOrder(t *testing.T) {
	out := t.TempDir()
	dir := filepath.Join(out, "Minha Playlist")
	// Unrelated file already in the library must not be picked up.
	if err := os.WriteFile(filepath.Join(out, "zzz antiga.mp3"), nil, 0644); err != nil {
		t.Fatal(err)
	}
	argsFile := fakeYtDlp(t, `
mkdir -p "`+dir+`"
touch "`+dir+`/01 - A.mp3" "`+dir+`/01 - A.jpg" "`+dir+`/02 - B.mp3"
echo "`+dir+`/01 - A.mp3"
echo "`+dir+`/02 - B.mp3"
echo "/etc/passwd"
echo "ERROR: [youtube] xyz: Video unavailable" >&2
exit 1`)

	d, err := NewDownloader(out)
	if err != nil {
		t.Fatal(err)
	}
	res, err := d.Download(context.Background(), requestFor(t, "https://www.youtube.com/playlist?list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6", ""))
	if err != nil {
		t.Fatalf("playlist parcial não deveria falhar: %v", err)
	}
	if !res.IsPlaylist || res.FailedItems != 1 || len(res.Items) != 2 {
		t.Fatalf("resultado inesperado: %+v", res)
	}
	if filepath.Base(res.Items[0].AudioPath) != "01 - A.mp3" || res.Items[0].CoverPath == "" {
		t.Errorf("item 0 inesperado: %+v", res.Items[0])
	}
	if filepath.Base(res.Items[1].AudioPath) != "02 - B.mp3" || res.Items[1].CoverPath != "" {
		t.Errorf("item 1 inesperado: %+v", res.Items[1])
	}

	args := readArgs(t, argsFile)
	if got := args[len(args)-2:]; got[0] != "--" || got[1] != "https://www.youtube.com/playlist?list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6" {
		t.Errorf("url deve vir depois de --, args finais: %v", got)
	}
	if !contains(args, "--yes-playlist") || contains(args, "--playlist-end") {
		t.Errorf("flags de playlist inesperadas: %v", args)
	}
}

// A mix defaults to the seed track (RF6.2), and only gets capped when the user
// explicitly asks for the whole thing.
func TestDownloadMixDefaultsToSingleTrack(t *testing.T) {
	out := t.TempDir()
	argsFile := fakeYtDlp(t, `touch "`+out+`/a.mp3"; echo "`+out+`/a.mp3"`)

	d, err := NewDownloader(out)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.Download(context.Background(), requestFor(t, "https://www.youtube.com/watch?list=RDlBDDMrUCz1A&v=lBDDMrUCz1A", "")); err != nil {
		t.Fatal(err)
	}
	args := readArgs(t, argsFile)
	if !contains(args, "--no-playlist") {
		t.Errorf("mix sem modo explícito deve baixar só a faixa semente: %v", args)
	}
}

func TestDownloadMixAsPlaylistIsCapped(t *testing.T) {
	out := t.TempDir()
	argsFile := fakeYtDlp(t, `touch "`+out+`/a.mp3"; echo "`+out+`/a.mp3"`)

	d, err := NewDownloader(out)
	if err != nil {
		t.Fatal(err)
	}
	req := requestForMode(t, "https://www.youtube.com/watch?list=RDlBDDMrUCz1A&v=lBDDMrUCz1A", "", ingest.ModePlaylist)
	if _, err := d.Download(context.Background(), req); err != nil {
		t.Fatal(err)
	}
	args := readArgs(t, argsFile)
	if !contains(args, "--yes-playlist") || !contains(args, "--playlist-end") {
		t.Errorf("mix pedido como playlist deve vir limitado: %v", args)
	}
}

func TestDownloadTrackFailure(t *testing.T) {
	out := t.TempDir()
	fakeYtDlp(t, `echo "ERROR: [youtube] lBDDMrUCz1A: Private video" >&2; exit 1`)

	d, err := NewDownloader(out)
	if err != nil {
		t.Fatal(err)
	}
	_, err = d.Download(context.Background(), requestFor(t, "https://www.youtube.com/watch?v=lBDDMrUCz1A", ""))
	if err == nil || !strings.Contains(err.Error(), "Private video") {
		t.Fatalf("esperava erro com a mensagem do yt-dlp, veio: %v", err)
	}
}

func TestDownloadRejectsUnsupportedProvider(t *testing.T) {
	d, err := NewDownloader(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	// The allowlist is enforced before a reference ever exists.
	if _, err := ingest.ParseSourceURL("https://evil.com/watch?v=lBDDMrUCz1A"); err == nil {
		t.Error("host fora da allowlist deveria falhar na análise da url")
	}

	req := ports.DownloadRequest{Ref: ingest.SourceRef{Provider: "soundcloud", Kind: ingest.KindTrack, VideoID: "lBDDMrUCz1A"}}
	if _, err := d.Download(context.Background(), req); err == nil {
		t.Error("provedor não suportado deveria falhar")
	}
}

// Guardrail 5: a crafted folder name must never escape the media root.
func TestDownloadKeepsSubDirInsideRoot(t *testing.T) {
	out := t.TempDir()
	fakeYtDlp(t, `exit 1`)

	d, err := NewDownloader(out)
	if err != nil {
		t.Fatal(err)
	}

	// The download itself fails (the stub exits 1); what matters is where it pointed.
	_, _ = d.Download(context.Background(), requestFor(t, "https://www.youtube.com/watch?v=lBDDMrUCz1A", "../../etc"))

	entries, err := os.ReadDir(filepath.Dir(out))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() == "etc" {
			t.Fatalf("subdiretório escapou da raiz de mídia: %s", filepath.Join(filepath.Dir(out), entry.Name()))
		}
	}
	if _, err := os.Stat(filepath.Join(out, "_.._etc")); err != nil {
		t.Errorf("subdiretório deveria ter sido criado sanitizado dentro da raiz: %v", err)
	}
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
