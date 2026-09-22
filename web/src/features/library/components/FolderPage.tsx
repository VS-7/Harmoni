import React from 'react';
import { Folder, MoreHorizontal, Plus } from 'lucide-react';
import { navigate } from '../../../app/router/router.ts';
import { EntityPage } from '../../../shared/components/EntityPage.tsx';
import { EmptyPage, LoadingDots } from '../../../shared/components/EmptyPage.tsx';
import { IconButton } from '../../../shared/components/IconButton.tsx';
import { PillButton } from '../../../shared/components/Modal.tsx';
import { CardGrid } from '../../../shared/components/Shelf.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle.ts';
import { pluralize } from '../../../shared/utils/formatters.ts';
import { PlaylistCard } from '../../home/components/HomeCards.tsx';
import { useLibraryStore } from '../store/libraryStore.ts';
import { folderMenu, renameFolder } from '../menus.tsx';
import { FolderCover } from './Covers.tsx';

export const FolderPage: React.FC<{ folderId: string }> = ({ folderId }) => {
  const loaded = useLibraryStore((s) => s.loaded);
  const folder = useLibraryStore((s) => s.folders.find((f) => f.id === folderId));
  const allPlaylists = useLibraryStore((s) => s.playlists);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const playlists = allPlaylists.filter((pl) => pl.folderId === folderId);
  useDocumentTitle(folder?.name);

  if (!loaded) return <LoadingDots />;
  if (!folder) return <EmptyPage icon={Folder} title="Pasta não encontrada" description="Ela pode ter sido excluída." />;

  const create = async () => {
    const created = await createPlaylist({ folderId });
    navigate({ name: 'playlist', id: created.id });
  };

  return (
    <EntityPage
      color="#535353"
      image={<FolderCover className="aspect-square w-full" iconSize={72} shadow />}
      kind="Pasta"
      title={folder.name}
      onTitleClick={() => renameFolder(folder)}
      meta={<span>{pluralize(playlists.length, 'playlist', 'playlists')}</span>}
      actions={
        <>
          <PillButton variant="outline" className="h-8 px-4 text-sm" onClick={() => void create()}>
            <Plus size={16} /> Criar playlist
          </PillButton>
          <IconButton
            label={`Mais opções para ${folder.name}`}
            size="lg"
            onClick={(event) => openMenu(event, folderMenu(folder), { header: { title: folder.name, subtitle: 'Pasta' } })}
          >
            <MoreHorizontal size={28} />
          </IconButton>
        </>
      }
    >
      {playlists.length === 0 ? (
        <EmptyPage
          icon={Folder}
          title="Esta pasta está vazia"
          description='Use "Mover para a pasta" no menu de uma playlist, ou crie uma aqui dentro.'
        />
      ) : (
        <div className="px-1 md:px-3">
          <CardGrid>
            {playlists.map((pl) => (
              <PlaylistCard key={pl.id} playlist={pl} />
            ))}
          </CardGrid>
        </div>
      )}
    </EntityPage>
  );
};
