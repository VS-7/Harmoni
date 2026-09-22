package postgres

import "testing"

func TestIsUUID(t *testing.T) {
	valid := []string{
		"0cdc5e6a-d65a-4905-aa52-1fdeed8bc4ad",
		"0CDC5E6A-D65A-4905-AA52-1FDEED8BC4AD",
	}
	for _, id := range valid {
		if !isUUID(id) {
			t.Errorf("%q deveria ser aceito", id)
		}
	}

	invalid := []string{
		"",
		"nao-existe",
		"0cdc5e6a-d65a-4905-aa52-1fdeed8bc4a",
		"0cdc5e6a-d65a-4905-aa52-1fdeed8bc4adx",
		"0cdc5e6a-d65a-4905-aa52-1fdeed8bc4a'; DROP TABLE playlists; --",
	}
	for _, id := range invalid {
		if isUUID(id) {
			t.Errorf("%q deveria ser rejeitado", id)
		}
	}
}
