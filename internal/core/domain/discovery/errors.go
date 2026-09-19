package discovery

import "errors"

var (
	ErrEmptyQuery        = errors.New("termo de busca não pode ser vazio")
	ErrInvalidKind       = errors.New("tipo de busca inválido: use all, track, playlist ou artist")
	ErrInvalidPlaylistID = errors.New("identificador de playlist remota inválido")
	ErrInvalidArtistID   = errors.New("identificador de canal remoto inválido")
	ErrRemoteUnavailable = errors.New("não foi possível consultar o catálogo remoto")
	ErrRemoteNotFound    = errors.New("item não encontrado no catálogo remoto")
)
