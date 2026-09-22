package playlist

import "errors"

var (
	ErrPlaylistNotFound       = errors.New("playlist não encontrada")
	ErrInvalidPlaylistName    = errors.New("nome da playlist não pode ser vazio")
	ErrTrackAlreadyInPlaylist = errors.New("faixa já existe na playlist")
	ErrTrackNotInPlaylist     = errors.New("faixa não encontrada na playlist")
	ErrFolderNotFound         = errors.New("pasta não encontrada")
	ErrInvalidFolderName      = errors.New("nome da pasta não pode ser vazio")
	ErrNameTooLong            = errors.New("nome deve ter no máximo 255 caracteres")
)
