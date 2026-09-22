import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogStore } from '../store/dialogStore.ts';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}

/** Diálogo escuro do Spotify ("Editar detalhes", "Nova pasta"). */
export const Modal: React.FC<ModalProps> = ({ title, onClose, children, width = 524 }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 animate-sp-fade bg-black/70" />
      <div
        className="relative max-h-[90dvh] w-full animate-sp-pop overflow-y-auto rounded-lg bg-sp-menu p-6 shadow-[0_4px_60px_rgba(0,0,0,0.5)]"
        style={{ maxWidth: width }}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full text-sp-subdued hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

/** Confirmação clara do Spotify ("Excluir da Sua Biblioteca?"). */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, message, confirmLabel, onConfirm, onClose }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 animate-sp-fade bg-black/70" />
      <div className="relative w-full max-w-[420px] animate-sp-pop rounded-lg bg-white p-8 text-black shadow-[0_4px_60px_rgba(0,0,0,0.5)]">
        <h2 className="text-2xl font-bold">{title}</h2>
        <div className="mt-2 text-sm text-[#333]">{message}</div>
        <div className="mt-8 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-full px-8 text-base font-bold text-black transition-transform hover:scale-[1.04]"
          >
            Cancelar
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => {
              onClose();
              void onConfirm();
            }}
            className="h-12 rounded-full bg-sp-green px-8 text-base font-bold text-black transition-transform hover:scale-[1.04] hover:bg-sp-green-hover"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Renderiza o diálogo aberto via openDialog(). */
export const DialogHost: React.FC = () => {
  const render = useDialogStore((s) => s.render);
  const close = useDialogStore((s) => s.close);
  if (!render) return null;
  return createPortal(render(close), document.body);
};

/** Botão branco em pílula dos diálogos ("Salvar", "Criar"). */
export const PillButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'white' | 'green' | 'outline' }> = ({
  variant = 'white',
  className = '',
  ...rest
}) => (
  <button
    type="button"
    className={[
      'inline-flex h-12 items-center justify-center gap-2 rounded-full px-8 text-base font-bold transition-transform duration-100',
      'hover:scale-[1.04] active:scale-100 disabled:pointer-events-none disabled:opacity-50',
      variant === 'white' ? 'bg-white text-black' : '',
      variant === 'green' ? 'bg-sp-green text-black hover:bg-sp-green-hover' : '',
      variant === 'outline' ? 'border border-sp-muted text-white hover:border-white' : '',
      className,
    ].join(' ')}
    {...rest}
  />
);

/** Campo escuro dos diálogos, com o rótulo flutuante do Spotify. */
export const TextField: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; multiline?: false }
> = ({ label, className = '', id, ...rest }) => {
  const fieldId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className={`group relative ${className}`}>
      <label
        htmlFor={fieldId}
        className="pointer-events-none absolute -top-2 left-2.5 px-1 text-xs font-bold text-white opacity-0 transition-opacity group-focus-within:opacity-100"
      >
        {label}
      </label>
      <input
        id={fieldId}
        className="h-10 w-full rounded bg-white/10 px-3 text-sm text-white outline-none ring-sp-muted focus:bg-sp-input focus:ring-1"
        {...rest}
      />
    </div>
  );
};
