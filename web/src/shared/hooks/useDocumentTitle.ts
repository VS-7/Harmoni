import { useEffect } from 'react';

/** "Harmoni – Nome da página", como o título da aba do Spotify Web. */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `Harmoni – ${title}` : 'Harmoni';
  }, [title]);
}
