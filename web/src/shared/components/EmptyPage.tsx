import React from 'react';
import type { IconComponent } from '../store/menuStore.ts';

interface EmptyPageProps {
  icon: IconComponent;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Estado vazio do Spotify: ícone grande, título em negrito e um botão em pílula. */
export const EmptyPage: React.FC<EmptyPageProps> = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
    <Icon size={56} strokeWidth={1.25} className="text-white" />
    <h2 className="text-2xl font-bold md:text-[32px]">{title}</h2>
    {description && <p className="max-w-md text-base text-white/80">{description}</p>}
    {action}
  </div>
);

/** Carregando: três pontos pulsando no lugar do conteúdo. */
export const LoadingDots: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex justify-center gap-1.5 py-16 ${className}`} role="status" aria-label="Carregando">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="h-2 w-2 animate-pulse rounded-full bg-sp-subdued"
        style={{ animationDelay: `${i * 160}ms` }}
      />
    ))}
  </div>
);
