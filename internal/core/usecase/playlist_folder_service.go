package usecase

import (
	"context"
	"fmt"
	"log/slog"

	"harmoni/internal/core/domain/playlist"
	"harmoni/internal/core/ports"
)

// PlaylistFolderService implements ports.PlaylistFolderUseCase: the "Pasta" option of
// the library "Criar" menu.
type PlaylistFolderService struct {
	folderRepo ports.PlaylistFolderRepository
}

func NewPlaylistFolderService(folderRepo ports.PlaylistFolderRepository) *PlaylistFolderService {
	return &PlaylistFolderService{folderRepo: folderRepo}
}

func (s *PlaylistFolderService) CreateFolder(ctx context.Context, name string) (*playlist.Folder, error) {
	folder, err := playlist.NewFolder(playlist.FolderID(newUUID()), name)
	if err != nil {
		return nil, fmt.Errorf("dados inválidos para pasta: %w", err)
	}

	if err := s.folderRepo.SaveFolder(ctx, folder); err != nil {
		return nil, fmt.Errorf("falha ao salvar pasta: %w", err)
	}

	slog.InfoContext(ctx, "pasta criada com sucesso", "id", folder.ID, "nome", folder.Name)
	return folder, nil
}

func (s *PlaylistFolderService) ListFolders(ctx context.Context) ([]*playlist.Folder, error) {
	folders, err := s.folderRepo.ListFolders(ctx)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar pastas: %w", err)
	}
	return folders, nil
}

func (s *PlaylistFolderService) RenameFolder(ctx context.Context, id playlist.FolderID, name string) (*playlist.Folder, error) {
	folder, err := s.folderRepo.FindFolderByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("falha ao buscar pasta para renomear: %w", err)
	}

	if err := folder.Rename(name); err != nil {
		return nil, fmt.Errorf("dados inválidos para pasta: %w", err)
	}

	if err := s.folderRepo.SaveFolder(ctx, folder); err != nil {
		return nil, fmt.Errorf("falha ao salvar pasta renomeada: %w", err)
	}

	slog.InfoContext(ctx, "pasta renomeada com sucesso", "id", folder.ID, "nome", folder.Name)
	return folder, nil
}

func (s *PlaylistFolderService) DeleteFolder(ctx context.Context, id playlist.FolderID) error {
	if err := s.folderRepo.DeleteFolder(ctx, id); err != nil {
		return fmt.Errorf("falha ao remover pasta: %w", err)
	}
	slog.InfoContext(ctx, "pasta removida com sucesso", "id", id)
	return nil
}

func (s *PlaylistFolderService) MovePlaylist(ctx context.Context, playlistID playlist.PlaylistID, folderID *playlist.FolderID) error {
	// A nil folder means "back to the root", which needs no lookup.
	if folderID != nil {
		if _, err := s.folderRepo.FindFolderByID(ctx, *folderID); err != nil {
			return fmt.Errorf("falha ao buscar pasta de destino: %w", err)
		}
	}

	if err := s.folderRepo.AssignPlaylist(ctx, playlistID, folderID); err != nil {
		return fmt.Errorf("falha ao mover playlist: %w", err)
	}

	slog.InfoContext(ctx, "playlist movida", "playlist_id", playlistID, "folder_id", folderID)
	return nil
}
