package ingest

import "testing"

func TestCleanTitle(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want string
	}{
		{"sem ruído", "Bohemian Rhapsody", "Bohemian Rhapsody"},
		{"official video", "Bohemian Rhapsody (Official Video)", "Bohemian Rhapsody"},
		{"clipe oficial", "Tempo Perdido (Clipe Oficial)", "Tempo Perdido"},
		{"colchetes 4k", "Faroeste Caboclo [4K]", "Faroeste Caboclo"},
		{"lyrics", "Eduardo e Mônica (Lyrics)", "Eduardo e Mônica"},
		{"ruído combinado", "Will Rock You (Official Music Video) [HD]", "Will Rock You"},
		{"ruído solto após traço", "Another One Bites the Dust - Official Video", "Another One Bites the Dust"},
		{"vários ruídos soltos", "Somebody to Love - Official Video - HD", "Somebody to Love"},
		{"preserva ao vivo", "Tempo Perdido (Ao Vivo)", "Tempo Perdido (Ao Vivo)"},
		{"preserva feat", "Música (feat. Alguém)", "Música (feat. Alguém)"},
		{"preserva remix", "Faixa (Remix)", "Faixa (Remix)"},
		{"título só de ruído não some", "(Official Video)", "(Official Video)"},
		{"espaços colapsados", "  Uma   Faixa  (Official Audio)  ", "Uma Faixa"},
		{"vazio", "", ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := CleanTitle(tc.raw); got != tc.want {
				t.Errorf("CleanTitle(%q) = %q, esperado %q", tc.raw, got, tc.want)
			}
		})
	}
}

func TestSplitArtistTitle(t *testing.T) {
	cases := []struct {
		raw        string
		wantArtist string
		wantTitle  string
	}{
		{"Legião Urbana - Tempo Perdido (Official Video)", "Legião Urbana", "Tempo Perdido"},
		{"Queen – Bohemian Rhapsody", "Queen", "Bohemian Rhapsody"},
		{"Bohemian Rhapsody", "", "Bohemian Rhapsody"},
		{"- Só o traço", "", "Só o traço"},
	}

	for _, tc := range cases {
		artist, title := SplitArtistTitle(tc.raw)
		if artist != tc.wantArtist || title != tc.wantTitle {
			t.Errorf("SplitArtistTitle(%q) = (%q, %q), esperado (%q, %q)", tc.raw, artist, title, tc.wantArtist, tc.wantTitle)
		}
	}
}
