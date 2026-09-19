import React, { useState } from 'react';
import { Sheet } from '../../../shared/ui/Sheet.tsx';
import { GlassButton } from '../../../shared/ui/glass/index.ts';
import { GlassField } from '../../../shared/ui/GlassField.tsx';
import { apiClient } from '../../../adapters/api/client.ts';

interface NewPlaylistSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export const NewPlaylistSheet: React.FC<NewPlaylistSheetProps> = ({ open, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.createPlaylist(name.trim(), description.trim());
      setName('');
      setDescription('');
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Nova playlist">
      <div className="space-y-3 px-5 pb-4">
        <h2 className="text-title text-on-glass">Nova playlist</h2>
        <GlassField
          placeholder="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nome da playlist"
          autoFocus
        />
        <GlassField
          placeholder="Descrição (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Descrição da playlist"
        />
        {error && <p className="text-footnote text-[#ff6961]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <GlassButton size="md" shape="label" variant="light" onClick={onClose}>
            Cancelar
          </GlassButton>
          <GlassButton size="md" shape="label" onClick={() => void submit()} disabled={saving || !name.trim()}>
            {saving ? 'Criando…' : 'Criar'}
          </GlassButton>
        </div>
      </div>
    </Sheet>
  );
};
