package ingest

import "errors"

var (
	ErrInvalidURL          = errors.New("url inválida ou protocolo não suportado (apenas http e https)")
	ErrUnsafeURL           = errors.New("url contém caracteres potencialmente inseguros")
	ErrUnsupportedSource   = errors.New("link não suportado: use um link de música, playlist ou canal do YouTube")
	ErrInvalidSourceID     = errors.New("identificador de vídeo ou playlist inválido no link")
	ErrInvalidDownloadMode = errors.New("modo de download inválido para este link")
	ErrInvalidStatusOrder  = errors.New("transição de status de download job inválida")
	ErrJobNotFound         = errors.New("job de download não encontrado")
	ErrEmptyJobID          = errors.New("id do job não pode ser vazio")
)
