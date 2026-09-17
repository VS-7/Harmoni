package ingest

import "errors"

var (
	ErrInvalidURL         = errors.New("url inválida ou protocolo não suportado (apenas http e https)")
	ErrUnsafeURL          = errors.New("url contém caracteres potencialmente inseguros")
	ErrInvalidStatusOrder = errors.New("transição de status de download job inválida")
	ErrJobNotFound        = errors.New("job de download não encontrado")
	ErrEmptyJobID         = errors.New("id do job não pode ser vazio")
)
