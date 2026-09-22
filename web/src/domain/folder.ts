export type FolderID = string;

/** Pasta da Sua Biblioteca: agrupa playlists, nunca as apaga ao ser excluída. */
export interface PlaylistFolder {
  id: FolderID;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}
