package playlist

import "errors"

var (
	ErrPlaylistNotFound       = errors.New("playlist não encontrada")
	ErrInvalidPlaylistName    = errors.New("nome da playlist não pode ser vazio")
	ErrTrackAlreadyInPlaylist = errors.New("faixa já existe na playlist")
	ErrTrackNotInPlaylist     = errors.New("faixa não encontrada na playlist")
)
