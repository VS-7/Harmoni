package library

import "errors"

var (
	ErrInvalidTrackDuration = errors.New("duração da faixa deve ser superior a zero")
	ErrEmptyFilePath        = errors.New("caminho do arquivo não pode ser vazio")
	ErrEmptyTitle           = errors.New("título não pode ser vazio")
	ErrEmptyArtistName      = errors.New("nome do artista não pode ser vazio")
	ErrEmptyAlbumTitle      = errors.New("título do álbum não pode ser vazio")
	ErrEmptyTrackID         = errors.New("id da faixa não pode ser vazio")
	ErrTrackNotFound        = errors.New("faixa não encontrada")
	ErrAlbumNotFound        = errors.New("álbum não encontrado")
	ErrArtistNotFound       = errors.New("artista não encontrado")
)
