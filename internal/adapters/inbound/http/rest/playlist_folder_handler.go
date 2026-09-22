package rest

import (
	"encoding/json"
	"errors"
	"net/http"

	"harmoni/internal/core/domain/playlist"
	"harmoni/internal/core/ports"
)

type PlaylistFolderHandler struct {
	folderUC ports.PlaylistFolderUseCase
}

func NewPlaylistFolderHandler(folderUC ports.PlaylistFolderUseCase) *PlaylistFolderHandler {
	return &PlaylistFolderHandler{folderUC: folderUC}
}

func (h *PlaylistFolderHandler) ListFolders(w http.ResponseWriter, r *http.Request) {
	folders, err := h.folderUC.ListFolders(r.Context())
	if err != nil {
		http.Error(w, `{"error": "falha ao listar pastas"}`, http.StatusInternalServerError)
		return
	}
	if folders == nil {
		folders = []*playlist.Folder{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data":  folders,
		"total": len(folders),
	})
}

type folderNameRequest struct {
	Name string `json:"name"`
}

func (h *PlaylistFolderHandler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	var req folderNameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "corpo de requisição inválido"}`, http.StatusBadRequest)
		return
	}

	folder, err := h.folderUC.CreateFolder(r.Context(), req.Name)
	if err != nil {
		writeFolderError(w, err, "falha ao criar pasta")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(folder)
}

func (h *PlaylistFolderHandler) RenameFolder(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	var req folderNameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "corpo de requisição inválido"}`, http.StatusBadRequest)
		return
	}

	folder, err := h.folderUC.RenameFolder(r.Context(), playlist.FolderID(id), req.Name)
	if err != nil {
		writeFolderError(w, err, "falha ao renomear pasta")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(folder)
}

func (h *PlaylistFolderHandler) DeleteFolder(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	if err := h.folderUC.DeleteFolder(r.Context(), playlist.FolderID(id)); err != nil {
		writeFolderError(w, err, "falha ao remover pasta")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// movePlaylistRequest uses a null folderId to send the playlist back to the root.
type movePlaylistRequest struct {
	FolderID *string `json:"folderId"`
}

func (h *PlaylistFolderHandler) MovePlaylist(w http.ResponseWriter, r *http.Request) {
	playlistID := r.PathValue("id")
	if playlistID == "" {
		http.Error(w, `{"error": "id da playlist é obrigatório"}`, http.StatusBadRequest)
		return
	}

	var req movePlaylistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "corpo de requisição inválido"}`, http.StatusBadRequest)
		return
	}

	var folderID *playlist.FolderID
	if req.FolderID != nil && *req.FolderID != "" {
		id := playlist.FolderID(*req.FolderID)
		folderID = &id
	}

	if err := h.folderUC.MovePlaylist(r.Context(), playlist.PlaylistID(playlistID), folderID); err != nil {
		writeFolderError(w, err, "falha ao mover playlist")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeFolderError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, playlist.ErrFolderNotFound):
		http.Error(w, `{"error": "pasta não encontrada"}`, http.StatusNotFound)
	case errors.Is(err, playlist.ErrPlaylistNotFound):
		http.Error(w, `{"error": "playlist não encontrada"}`, http.StatusNotFound)
	case errors.Is(err, playlist.ErrInvalidFolderName):
		http.Error(w, `{"error": "o nome da pasta é obrigatório"}`, http.StatusBadRequest)
	case errors.Is(err, playlist.ErrNameTooLong):
		http.Error(w, `{"error": "o nome deve ter no máximo 255 caracteres"}`, http.StatusBadRequest)
	default:
		// The fallback is always one of the literal messages above, never user input.
		http.Error(w, `{"error": "`+fallback+`"}`, http.StatusInternalServerError)
	}
}
