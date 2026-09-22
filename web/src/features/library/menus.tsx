import React, { useMemo, useState } from 'react';
import {
  CircleArrowDown,
  CircleCheck,
  Disc3,
  Folder,
  FolderInput,
  FolderMinus,
  FolderPlus,
  ListEnd,
  ListMusic,
  ListPlus,
  ListStart,
  Mic2,
  Pencil,
  Plus,
  Radio,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { Track } from '../../domain/track.ts';
import type { Playlist } from '../../domain/playlist.ts';
import type { PlaylistFolder } from '../../domain/folder.ts';
import type { Album, Artist } from '../../domain/album.ts';
import type { MenuEntry } from '../../shared/store/menuStore.ts';
import { openDialog } from '../../shared/store/dialogStore.ts';
import { toast } from '../../shared/store/toastStore.ts';
import { ConfirmDialog } from '../../shared/components/Modal.tsx';
import { navigate, useRouter } from '../../app/router/router.ts';
import { apiClient } from '../../adapters/api/client.ts';
import { usePlayerStore } from '../player/store/playerStore.ts';
import { useOfflineStore } from '../offline/store/offlineStore.ts';
import { useLibraryStore } from './store/libraryStore.ts';
import { EditPlaylistDialog, FolderNameDialog, createFolderNamed } from './components/LibraryDialogs.tsx';
import { PlaylistCover } from './components/Covers.tsx';

type TrackSource = Track[] | (() => Promise<Track[]>);

async function resolve(source: TrackSource): Promise<Track[]> {
  return typeof source === 'function' ? source() : source;
}

function describe(count: number): string {
  return count === 1 ? '1 música' : `${count} músicas`;
}

/** Busca + "Nova playlist" + lista, o submenu "Adicionar à playlist" do Spotify. */
const PlaylistPicker: React.FC<{ source: TrackSource; close: () => void; excludeId?: string }> = ({
  source,
  close,
  excludeId,
}) => {
  const [query, setQuery] = useState('');
  const playlists = useLibraryStore((s) => s.playlists);
  const addTracks = useLibraryStore((s) => s.addTracks);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);

  const options = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return playlists
      .filter((pl) => !pl.isSmart && pl.id !== excludeId)
      .filter((pl) => !term || pl.name.toLocaleLowerCase('pt-BR').includes(term));
  }, [playlists, query, excludeId]);

  async function addTo(pl: Playlist) {
    close();
    const tracks = await resolve(source);
    const added = await addTracks(pl.id, tracks);
    toast(added > 0 ? `Adicionado a ${pl.name}` : 'Não foi possível adicionar');
  }

  async function createWith() {
    close();
    const tracks = await resolve(source);
    const created = await createPlaylist({ tracks });
    toast(`Adicionado a ${created.name}`);
  }

  return (
    <div className="w-[280px] max-md:w-full">
      <div className="p-1">
        <label className="flex h-9 items-center gap-2 rounded bg-sp-input px-2 text-sm focus-within:ring-1 focus-within:ring-white/40">
          <Search size={16} className="shrink-0 text-sp-subdued" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Buscar uma playlist"
            aria-label="Buscar uma playlist"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
      </div>
      <button
        type="button"
        data-menu-item
        onClick={() => void createWith()}
        className="flex h-10 w-full items-center gap-3 rounded-sm px-3 text-left text-sm hover:bg-white/10 max-md:min-h-[52px] max-md:text-base"
      >
        <Plus size={16} className="text-sp-subdued" />
        Nova playlist
      </button>
      <div className="mx-1 my-1 h-px bg-white/10" />
      <div className="max-h-[280px] overflow-y-auto max-md:max-h-[50dvh]">
        {options.length === 0 && <p className="px-3 py-2 text-sm text-sp-subdued">Nenhuma playlist encontrada</p>}
        {options.map((pl) => (
          <button
            key={pl.id}
            type="button"
            data-menu-item
            onClick={() => void addTo(pl)}
            className="flex h-10 w-full items-center gap-3 rounded-sm px-3 text-left text-sm hover:bg-white/10 max-md:min-h-[52px] max-md:text-base"
          >
            <PlaylistCover playlist={pl} className="h-6 w-6 max-md:h-10 max-md:w-10" iconSize={12} />
            <span className="truncate">{pl.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

function addToPlaylistEntry(source: TrackSource, excludeId?: string): MenuEntry {
  return {
    id: 'add-to-playlist',
    label: 'Adicionar à playlist',
    icon: ListPlus,
    submenu: [
      {
        kind: 'custom',
        id: 'picker',
        render: (close) => <PlaylistPicker source={source} close={close} excludeId={excludeId} />,
      },
    ],
  };
}

function offlineEntries(source: TrackSource, batchId: string, knownTracks?: Track[]): MenuEntry[] {
  const offline = useOfflineStore.getState();
  if (knownTracks && knownTracks.length === 1) {
    const [track] = knownTracks;
    const progress = offline.progress[track.id];
    if (progress !== undefined) {
      return [{ id: 'offline-cancel', label: `Cancelar download (${Math.round(progress * 100)}%)`, icon: X, onSelect: () => offline.cancel(track.id) }];
    }
    if (offline.offlineIds.has(track.id)) {
      return [
        {
          id: 'offline-remove',
          label: 'Remover do aparelho',
          icon: CircleCheck,
          active: true,
          onSelect: async () => {
            await offline.remove(track.id);
            toast('Removido do aparelho');
          },
        },
      ];
    }
  }
  if (knownTracks && knownTracks.length > 0 && knownTracks.every((t) => offline.offlineIds.has(t.id))) {
    return [{ id: 'offline-done', label: 'Tudo no aparelho', icon: CircleCheck, active: true, disabled: true }];
  }
  return [
    {
      id: 'offline-download',
      label: 'Baixar no aparelho',
      icon: CircleArrowDown,
      disabled: offline.batch !== null && offline.batch.id !== batchId,
      onSelect: async () => {
        const tracks = await resolve(source);
        if (tracks.length === 1) {
          toast('Baixando no aparelho…');
          await offline.download(tracks[0]).catch(() => toast('Falha ao baixar no aparelho'));
          return;
        }
        toast(`Baixando ${describe(tracks.length)} no aparelho`);
        await offline.downloadMany(batchId, tracks);
      },
    },
  ];
}

interface TrackMenuOptions {
  /** Presente quando o menu é aberto dentro de uma playlist editável. */
  playlistId?: string;
  onRemoved?: () => void;
}

/** Menu "..." de uma ou várias faixas selecionadas. */
export function trackMenu(tracks: Track[], options: TrackMenuOptions = {}): MenuEntry[] {
  const player = usePlayerStore.getState();
  const single = tracks.length === 1 ? tracks[0] : null;
  const entries: MenuEntry[] = [addToPlaylistEntry(tracks, options.playlistId)];

  if (options.playlistId) {
    const playlistId = options.playlistId;
    entries.push({
      id: 'remove-from-playlist',
      label: 'Remover desta playlist',
      icon: Trash2,
      onSelect: async () => {
        const library = useLibraryStore.getState();
        for (const track of tracks) await library.removeTrack(playlistId, track.id).catch(() => undefined);
        toast(single ? 'Removida desta playlist' : `${describe(tracks.length)} removidas desta playlist`);
        options.onRemoved?.();
      },
    });
  }

  entries.push(
    { kind: 'separator', id: 'sep-queue' },
    {
      id: 'add-queue',
      label: 'Adicionar à fila',
      icon: ListEnd,
      onSelect: () => {
        player.addManyToQueue(tracks);
        toast(single ? 'Adicionada à fila' : `${describe(tracks.length)} adicionadas à fila`);
      },
    },
  );

  if (single) {
    entries.push(
      {
        id: 'play-next',
        label: 'Tocar em seguida',
        icon: ListStart,
        onSelect: () => {
          player.playNext(single);
          toast('Vai tocar em seguida');
        },
      },
      { kind: 'separator', id: 'sep-go' },
      {
        id: 'radio',
        label: 'Ir para o rádio da música',
        icon: Radio,
        onSelect: () => navigate({ name: 'station', kind: 'track', id: single.id }),
      },
    );
    if (single.artist_id) {
      entries.push({
        id: 'artist',
        label: 'Ir para o artista',
        icon: Mic2,
        onSelect: () => navigate({ name: 'artist', id: single.artist_id }),
      });
    }
    if (single.album_id) {
      const albumId = single.album_id;
      entries.push({
        id: 'album',
        label: 'Ir para o álbum',
        icon: Disc3,
        onSelect: () => navigate({ name: 'album', id: albumId }),
      });
    }
  }

  entries.push({ kind: 'separator', id: 'sep-offline' }, ...offlineEntries(tracks, `tracks:${tracks.map((t) => t.id).join(',').slice(0, 64)}`, tracks));
  return entries;
}

function confirmDeletePlaylist(pl: Playlist) {
  openDialog((close) => (
    <ConfirmDialog
      title="Excluir da Sua Biblioteca?"
      message={
        <>
          Isso vai excluir <b>{pl.name}</b> da <b>Sua Biblioteca</b>.
        </>
      }
      confirmLabel="Excluir"
      onClose={close}
      onConfirm={async () => {
        await useLibraryStore.getState().deletePlaylist(pl.id);
        toast('Removida da Sua Biblioteca');
        // Só sai da tela se ela era a da playlist excluída.
        const route = useRouter.getState().route;
        if (route.name === 'playlist' && route.id === pl.id) navigate({ name: 'home' }, { replace: true });
      }}
    />
  ));
}

export function editPlaylistDetails(pl: Playlist) {
  openDialog((close) => <EditPlaylistDialog playlist={pl} onClose={close} />);
}

function moveToFolderEntry(pl: Playlist, folders: PlaylistFolder[]): MenuEntry {
  const library = useLibraryStore.getState();
  const submenu: MenuEntry[] = [
    {
      id: 'new-folder',
      label: 'Criar pasta',
      icon: FolderPlus,
      onSelect: () =>
        openDialog((close) => (
          <FolderNameDialog
            title="Nova pasta"
            initialName="Nova pasta"
            confirmLabel="Criar"
            onClose={close}
            onSubmit={async (name) => {
              const folder = await library.createFolder(name);
              await library.movePlaylist(pl.id, folder.id);
              toast(`Movida para ${folder.name}`);
            }}
          />
        )),
    },
  ];
  if (folders.length > 0) submenu.push({ kind: 'separator', id: 'sep-folders' });
  for (const folder of folders) {
    const here = pl.folderId === folder.id;
    submenu.push({
      id: `folder-${folder.id}`,
      label: folder.name,
      icon: Folder,
      active: here,
      disabled: here,
      onSelect: async () => {
        await library.movePlaylist(pl.id, folder.id);
        toast(`Movida para ${folder.name}`);
      },
    });
  }
  if (pl.folderId) {
    submenu.push(
      { kind: 'separator', id: 'sep-root' },
      {
        id: 'remove-folder',
        label: 'Remover da pasta',
        icon: FolderMinus,
        onSelect: async () => {
          await library.movePlaylist(pl.id, null);
          toast('Movida para Sua Biblioteca');
        },
      },
    );
  }
  return { id: 'move', label: 'Mover para a pasta', icon: FolderInput, submenu };
}

/** Menu de uma playlist (sidebar, card ou "..." do cabeçalho). */
export function playlistMenu(pl: Playlist): MenuEntry[] {
  const { folders } = useLibraryStore.getState();
  const loadTracks = async () => (await apiClient.getPlaylist(pl.id)).tracks ?? [];
  const seed = pl.coverTrackIds?.[0];

  const entries: MenuEntry[] = [
    {
      id: 'queue',
      label: 'Adicionar à fila',
      icon: ListEnd,
      onSelect: async () => {
        const tracks = await loadTracks();
        usePlayerStore.getState().addManyToQueue(tracks);
        toast(`${describe(tracks.length)} adicionadas à fila`);
      },
    },
    { kind: 'separator', id: 'sep-edit' },
    { id: 'edit', label: 'Editar detalhes', icon: Pencil, onSelect: () => editPlaylistDetails(pl) },
    moveToFolderEntry(pl, folders),
    { id: 'delete', label: 'Excluir', icon: Trash2, onSelect: () => confirmDeletePlaylist(pl) },
    { kind: 'separator', id: 'sep-offline' },
    ...offlineEntries(loadTracks, `playlist:${pl.id}`),
  ];

  if (seed) {
    entries.push({
      id: 'radio',
      label: 'Ir para o rádio da playlist',
      icon: Radio,
      onSelect: () => navigate({ name: 'station', kind: 'track', id: seed, title: `Rádio ${pl.name}` }),
    });
  }
  return entries;
}

export function renameFolder(folder: PlaylistFolder) {
  openDialog((close) => (
    <FolderNameDialog
      title="Renomear pasta"
      initialName={folder.name}
      confirmLabel="Salvar"
      onClose={close}
      onSubmit={(name) => useLibraryStore.getState().renameFolder(folder.id, name)}
    />
  ));
}

export function folderMenu(folder: PlaylistFolder): MenuEntry[] {
  const library = useLibraryStore.getState();
  return [
    {
      id: 'new-playlist',
      label: 'Criar playlist nesta pasta',
      icon: ListMusic,
      onSelect: async () => {
        const created = await library.createPlaylist({ folderId: folder.id });
        navigate({ name: 'playlist', id: created.id });
      },
    },
    { id: 'rename', label: 'Renomear', icon: Pencil, onSelect: () => renameFolder(folder) },
    {
      id: 'delete',
      label: 'Excluir',
      icon: Trash2,
      onSelect: () =>
        openDialog((close) => (
          <ConfirmDialog
            title="Excluir pasta?"
            message={
              <>
                Isso vai excluir a pasta <b>{folder.name}</b>. As playlists dentro dela voltam para a <b>Sua Biblioteca</b>.
              </>
            }
            confirmLabel="Excluir"
            onClose={close}
            onConfirm={async () => {
              await library.deleteFolder(folder.id);
              toast('Pasta excluída');
              const route = useRouter.getState().route;
              if (route.name === 'folder' && route.id === folder.id) navigate({ name: 'home' }, { replace: true });
            }}
          />
        )),
    },
  ];
}

export function albumMenu(album: Album): MenuEntry[] {
  const loadTracks = async () => (await apiClient.getAlbum(album.id)).tracks;
  return [
    {
      id: 'queue',
      label: 'Adicionar à fila',
      icon: ListEnd,
      onSelect: async () => {
        const tracks = await loadTracks();
        usePlayerStore.getState().addManyToQueue(tracks);
        toast(`${describe(tracks.length)} adicionadas à fila`);
      },
    },
    addToPlaylistEntry(loadTracks),
    { kind: 'separator', id: 'sep-go' },
    { id: 'artist', label: 'Ir para o artista', icon: Mic2, onSelect: () => navigate({ name: 'artist', id: album.artist_id }) },
    { kind: 'separator', id: 'sep-offline' },
    ...offlineEntries(loadTracks, `album:${album.id}`),
  ];
}

export function artistMenu(artist: Artist): MenuEntry[] {
  const loadTracks = async () => (await apiClient.getArtist(artist.id)).tracks;
  return [
    {
      id: 'radio',
      label: 'Ir para o rádio do artista',
      icon: Radio,
      onSelect: () => navigate({ name: 'station', kind: 'artist', id: artist.id }),
    },
    {
      id: 'queue',
      label: 'Adicionar à fila',
      icon: ListEnd,
      onSelect: async () => {
        const tracks = await loadTracks();
        usePlayerStore.getState().addManyToQueue(tracks);
        toast(`${describe(tracks.length)} adicionadas à fila`);
      },
    },
    { kind: 'separator', id: 'sep-offline' },
    ...offlineEntries(loadTracks, `artist:${artist.id}`),
  ];
}

const CreateOption: React.FC<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
}> = ({ icon: Icon, title, description, onClick }) => (
  <button
    type="button"
    data-menu-item
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-sm p-2 text-left hover:bg-white/10 max-md:px-4 max-md:py-3"
  >
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sp-input">
      <Icon size={22} className="text-white" />
    </span>
    <span className="min-w-0">
      <span className="block text-base font-bold">{title}</span>
      <span className="block text-sm text-sp-subdued">{description}</span>
    </span>
  </button>
);

/** Menu do botão "Criar" da Sua Biblioteca: playlist ou pasta. */
export function createMenu(folderId?: string | null): MenuEntry[] {
  return [
    {
      kind: 'custom',
      id: 'create-playlist',
      render: (close) => (
        <CreateOption
          icon={ListMusic}
          title="Playlist"
          description="Crie uma playlist com músicas"
          onClick={() => {
            close();
            void useLibraryStore
              .getState()
              .createPlaylist({ folderId })
              .then((created) => navigate({ name: 'playlist', id: created.id }))
              .catch((err: Error) => toast(err.message));
          }}
        />
      ),
    },
    {
      kind: 'custom',
      id: 'create-folder',
      render: (close) => (
        <CreateOption
          icon={Folder}
          title="Pasta"
          description="Organize suas playlists"
          onClick={() => {
            close();
            openDialog((closeDialog) => (
              <FolderNameDialog
                title="Nova pasta"
                initialName="Nova pasta"
                confirmLabel="Criar"
                onClose={closeDialog}
                onSubmit={createFolderNamed}
              />
            ));
          }}
        />
      ),
    },
  ];
}
