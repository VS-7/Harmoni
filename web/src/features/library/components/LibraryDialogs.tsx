import React, { useState } from 'react';
import { ListMusic } from 'lucide-react';
import type { Playlist } from '../../../domain/playlist.ts';
import { Modal, PillButton, TextField } from '../../../shared/components/Modal.tsx';
import { toast } from '../../../shared/store/toastStore.ts';
import { useLibraryStore } from '../store/libraryStore.ts';
import { PlaylistCover } from './Covers.tsx';

/** "Editar detalhes": nome e descrição, abertos pelo título da playlist ou pelo menu. */
export const EditPlaylistDialog: React.FC<{ playlist: Playlist; onClose: () => void }> = ({ playlist, onClose }) => {
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updatePlaylist = useLibraryStore((s) => s.updatePlaylist);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('O nome da playlist é obrigatório.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updatePlaylist(playlist.id, name.trim(), description.trim());
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Editar detalhes" onClose={onClose}>
      <form onSubmit={(e) => void save(e)}>
        {error && <p className="mb-4 rounded bg-[#e91429] px-3 py-2 text-sm font-medium">{error}</p>}
        <div className="grid grid-cols-[180px_1fr] gap-4 max-sm:grid-cols-1">
          <div className="group relative aspect-square w-[180px] max-sm:mx-auto">
            <PlaylistCover playlist={playlist} className="h-full w-full" iconSize={56} shadow />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded bg-black/70 text-sm opacity-0 transition-opacity group-hover:opacity-100">
              <ListMusic size={40} />
              A capa segue as músicas
            </span>
          </div>
          <div className="flex flex-col gap-4">
            <TextField
              label="Nome"
              value={name}
              maxLength={255}
              autoFocus
              placeholder="Adicione um nome"
              onChange={(e) => setName(e.target.value)}
            />
            <div className="group relative flex-1">
              <label
                htmlFor="playlist-description"
                className="pointer-events-none absolute -top-2 left-2.5 px-1 text-xs font-bold opacity-0 transition-opacity group-focus-within:opacity-100"
              >
                Descrição
              </label>
              <textarea
                id="playlist-description"
                value={description}
                maxLength={300}
                placeholder="Adicione uma descrição opcional"
                onChange={(e) => setDescription(e.target.value)}
                className="h-full min-h-[124px] w-full resize-none rounded bg-white/10 p-3 text-sm outline-none ring-sp-muted focus:bg-sp-input focus:ring-1"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <PillButton type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </PillButton>
        </div>
        <p className="mt-4 text-[11px] font-bold text-white/80">
          As alterações ficam salvas no seu servidor Harmoni e aparecem em todos os seus aparelhos.
        </p>
      </form>
    </Modal>
  );
};

/** Nome de pasta, para criar ou renomear. */
export const FolderNameDialog: React.FC<{
  title: string;
  initialName: string;
  confirmLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}> = ({ title, initialName, confirmLabel, onSubmit, onClose }) => {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Dê um nome para a pasta.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} width={420}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        {error && <p className="rounded bg-[#e91429] px-3 py-2 text-sm font-medium">{error}</p>}
        <TextField
          label="Nome"
          value={name}
          maxLength={255}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex justify-end">
          <PillButton type="submit" disabled={saving}>
            {saving ? 'Salvando…' : confirmLabel}
          </PillButton>
        </div>
      </form>
    </Modal>
  );
};

/** Cria a pasta pelo diálogo e avisa com o toast. */
export async function createFolderNamed(name: string): Promise<void> {
  await useLibraryStore.getState().createFolder(name);
  toast(`Pasta "${name}" criada`);
}
