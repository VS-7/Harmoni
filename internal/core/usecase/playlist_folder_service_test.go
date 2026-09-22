package usecase_test

import (
	"context"
	"errors"
	"testing"

	"harmoni/internal/core/domain/playlist"
	"harmoni/internal/core/usecase"
)

// mockFolderRepo keeps folders in memory and records where each playlist lives.
type mockFolderRepo struct {
	folders     map[playlist.FolderID]*playlist.Folder
	assignments map[playlist.PlaylistID]*playlist.FolderID
	// knownPlaylists mimics the UPDATE ... WHERE id = $1 of the real repository.
	knownPlaylists map[playlist.PlaylistID]bool
}

func newMockFolderRepo(playlistIDs ...playlist.PlaylistID) *mockFolderRepo {
	known := make(map[playlist.PlaylistID]bool, len(playlistIDs))
	for _, id := range playlistIDs {
		known[id] = true
	}
	return &mockFolderRepo{
		folders:        make(map[playlist.FolderID]*playlist.Folder),
		assignments:    make(map[playlist.PlaylistID]*playlist.FolderID),
		knownPlaylists: known,
	}
}

func (m *mockFolderRepo) SaveFolder(ctx context.Context, f *playlist.Folder) error {
	copied := *f
	m.folders[f.ID] = &copied
	return nil
}

func (m *mockFolderRepo) FindFolderByID(ctx context.Context, id playlist.FolderID) (*playlist.Folder, error) {
	f, ok := m.folders[id]
	if !ok {
		return nil, playlist.ErrFolderNotFound
	}
	copied := *f
	return &copied, nil
}

func (m *mockFolderRepo) ListFolders(ctx context.Context) ([]*playlist.Folder, error) {
	list := make([]*playlist.Folder, 0, len(m.folders))
	for _, f := range m.folders {
		list = append(list, f)
	}
	return list, nil
}

func (m *mockFolderRepo) DeleteFolder(ctx context.Context, id playlist.FolderID) error {
	if _, ok := m.folders[id]; !ok {
		return playlist.ErrFolderNotFound
	}
	delete(m.folders, id)
	// ON DELETE SET NULL: the playlists go back to the root.
	for pid, fid := range m.assignments {
		if fid != nil && *fid == id {
			m.assignments[pid] = nil
		}
	}
	return nil
}

func (m *mockFolderRepo) AssignPlaylist(ctx context.Context, playlistID playlist.PlaylistID, folderID *playlist.FolderID) error {
	if !m.knownPlaylists[playlistID] {
		return playlist.ErrPlaylistNotFound
	}
	m.assignments[playlistID] = folderID
	return nil
}

func TestPlaylistFolderService_CreateRenameDelete(t *testing.T) {
	ctx := context.Background()
	repo := newMockFolderRepo()
	svc := usecase.NewPlaylistFolderService(repo)

	folder, err := svc.CreateFolder(ctx, "  Academia ")
	if err != nil {
		t.Fatalf("falha ao criar pasta: %v", err)
	}
	if folder.ID == "" || folder.Name != "Academia" {
		t.Fatalf("pasta criada incorretamente: %+v", folder)
	}

	renamed, err := svc.RenameFolder(ctx, folder.ID, "Treino")
	if err != nil {
		t.Fatalf("falha ao renomear pasta: %v", err)
	}
	if renamed.Name != "Treino" || repo.folders[folder.ID].Name != "Treino" {
		t.Fatalf("renomeação não persistida: %+v", repo.folders[folder.ID])
	}

	folders, err := svc.ListFolders(ctx)
	if err != nil || len(folders) != 1 {
		t.Fatalf("esperava 1 pasta, obteve %d (err %v)", len(folders), err)
	}

	if err := svc.DeleteFolder(ctx, folder.ID); err != nil {
		t.Fatalf("falha ao remover pasta: %v", err)
	}
	if err := svc.DeleteFolder(ctx, folder.ID); !errors.Is(err, playlist.ErrFolderNotFound) {
		t.Fatalf("esperava ErrFolderNotFound ao remover de novo, obteve %v", err)
	}
}

func TestPlaylistFolderService_InvalidNames(t *testing.T) {
	ctx := context.Background()
	repo := newMockFolderRepo()
	svc := usecase.NewPlaylistFolderService(repo)

	if _, err := svc.CreateFolder(ctx, "   "); !errors.Is(err, playlist.ErrInvalidFolderName) {
		t.Fatalf("esperava ErrInvalidFolderName, obteve %v", err)
	}
	if len(repo.folders) != 0 {
		t.Fatal("pasta inválida não pode ser salva")
	}

	folder, _ := svc.CreateFolder(ctx, "Válida")
	if _, err := svc.RenameFolder(ctx, folder.ID, ""); !errors.Is(err, playlist.ErrInvalidFolderName) {
		t.Fatalf("esperava ErrInvalidFolderName ao renomear, obteve %v", err)
	}
	if repo.folders[folder.ID].Name != "Válida" {
		t.Fatal("renomeação inválida não pode alterar a pasta salva")
	}

	if _, err := svc.RenameFolder(ctx, "nao-existe", "X"); !errors.Is(err, playlist.ErrFolderNotFound) {
		t.Fatalf("esperava ErrFolderNotFound, obteve %v", err)
	}
}

func TestPlaylistFolderService_MovePlaylist(t *testing.T) {
	ctx := context.Background()
	repo := newMockFolderRepo("pl-1")
	svc := usecase.NewPlaylistFolderService(repo)
	folder, _ := svc.CreateFolder(ctx, "Rock")

	if err := svc.MovePlaylist(ctx, "pl-1", &folder.ID); err != nil {
		t.Fatalf("falha ao mover playlist: %v", err)
	}
	if got := repo.assignments["pl-1"]; got == nil || *got != folder.ID {
		t.Fatalf("playlist deveria estar na pasta %s, está em %v", folder.ID, got)
	}

	missing := playlist.FolderID("nao-existe")
	if err := svc.MovePlaylist(ctx, "pl-1", &missing); !errors.Is(err, playlist.ErrFolderNotFound) {
		t.Fatalf("esperava ErrFolderNotFound, obteve %v", err)
	}
	if got := repo.assignments["pl-1"]; got == nil || *got != folder.ID {
		t.Fatal("mover para pasta inexistente não pode tirar a playlist da pasta atual")
	}

	if err := svc.MovePlaylist(ctx, "pl-desconhecida", &folder.ID); !errors.Is(err, playlist.ErrPlaylistNotFound) {
		t.Fatalf("esperava ErrPlaylistNotFound, obteve %v", err)
	}

	if err := svc.MovePlaylist(ctx, "pl-1", nil); err != nil {
		t.Fatalf("falha ao voltar playlist para a raiz: %v", err)
	}
	if repo.assignments["pl-1"] != nil {
		t.Fatal("playlist deveria ter voltado para a raiz")
	}
}

func TestPlaylistFolderService_DeleteKeepsPlaylists(t *testing.T) {
	ctx := context.Background()
	repo := newMockFolderRepo("pl-1")
	svc := usecase.NewPlaylistFolderService(repo)
	folder, _ := svc.CreateFolder(ctx, "Temporária")
	_ = svc.MovePlaylist(ctx, "pl-1", &folder.ID)

	if err := svc.DeleteFolder(ctx, folder.ID); err != nil {
		t.Fatalf("falha ao remover pasta: %v", err)
	}
	if _, exists := repo.assignments["pl-1"]; !exists || repo.assignments["pl-1"] != nil {
		t.Fatal("a playlist deve continuar existindo, de volta à raiz")
	}
}
