import React, { useLayoutEffect, useRef, useState } from 'react';
import { useMainScroll } from '../../app/layout/scrollStore.ts';

interface EntityPageProps {
  /** Cor de destaque da capa: pinta o cabeçalho e o degradê abaixo dele. */
  color: string;
  image: React.ReactNode;
  kind: string;
  title: string;
  onTitleClick?: () => void;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  /** Conteúdo extra abaixo dos metadados (ex.: a música em destaque da rádio). */
  extra?: React.ReactNode;
  /** Botão verde do cabeçalho fixo que aparece ao rolar. */
  stickyAction?: React.ReactNode;
  /** Banner de artista: a imagem cobre o cabeçalho inteiro em vez de ficar à esquerda. */
  backgroundImage?: string | null;
  /** Barra de ações (play, aleatório, baixar, ...). */
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/** Título enorme que encolhe com o tamanho do texto, como nas páginas do Spotify. */
function titleSize(title: string): string {
  if (title.length <= 14) return 'text-[clamp(2.5rem,7vw,6rem)]';
  if (title.length <= 28) return 'text-[clamp(2rem,5vw,4.5rem)]';
  if (title.length <= 56) return 'text-[clamp(1.75rem,3.4vw,3rem)]';
  return 'text-[clamp(1.5rem,2.4vw,2rem)]';
}

/**
 * Layout das páginas de playlist, álbum, artista e rádio: cabeçalho colorido com a capa,
 * degradê que escurece até o fundo e cabeçalho compacto fixo ao rolar.
 */
export const EntityPage: React.FC<EntityPageProps> = ({
  color,
  image,
  kind,
  title,
  onTitleClick,
  description,
  meta,
  extra,
  stickyAction,
  backgroundImage,
  actions,
  children,
}) => {
  const headerRef = useRef<HTMLElement>(null);
  const [threshold, setThreshold] = useState(280);
  const stuck = useMainScroll((s) => s.y > threshold);

  useLayoutEffect(() => {
    const element = headerRef.current;
    if (!element) return;
    const measure = () => setThreshold(Math.max(80, element.offsetHeight - 64));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const TitleTag = onTitleClick ? 'button' : 'span';

  return (
    <div className="relative isolate">
      {/* Cabeçalho compacto fixo: surge quando o grande sai de vista. */}
      <div
        aria-hidden={!stuck}
        className={[
          'sticky top-0 z-20 -mb-16 flex h-16 items-center gap-3 px-4 transition-opacity duration-200 md:px-6',
          stuck ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        style={{ backgroundColor: color, backgroundImage: 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5))' }}
      >
        {stickyAction}
        <span className="truncate text-2xl font-bold">{title}</span>
      </div>

      <header
        ref={headerRef}
        className={[
          'relative flex items-end gap-6 overflow-hidden px-4 pb-6 md:px-6',
          backgroundImage
            ? 'min-h-[min(40vh,400px)] pt-24 max-md:min-h-[300px]'
            : 'min-h-[300px] pt-20 max-md:flex-col max-md:items-start max-md:gap-4 max-md:pt-16 md:min-h-[340px]',
        ].join(' ')}
        style={{ backgroundColor: color, backgroundImage: 'linear-gradient(transparent 0, rgba(0,0,0,0.5) 100%)' }}
      >
        {backgroundImage && (
          <div aria-hidden="true" className="absolute inset-0 -z-0">
            <img src={backgroundImage} alt="" className="h-full w-full scale-110 object-cover object-[center_30%] blur-[2px]" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.15)_0,rgba(0,0,0,0.65)_100%)]" />
          </div>
        )}
        {!backgroundImage && (
          <div className="w-[min(58vw,232px)] shrink-0 max-md:self-center md:w-[clamp(128px,18vw,232px)]">{image}</div>
        )}
        <div className="relative flex min-w-0 flex-1 flex-col gap-2 max-md:w-full">
          <span className="text-sm font-medium">{kind}</span>
          <TitleTag
            type={onTitleClick ? 'button' : undefined}
            onClick={onTitleClick}
            className={[
              'block break-words text-left font-black leading-[1.05] tracking-[-0.04em]',
              titleSize(title),
              onTitleClick ? 'cursor-pointer' : '',
            ].join(' ')}
          >
            {title}
          </TitleTag>
          {description && <div className="line-clamp-2 text-sm text-white/70">{description}</div>}
          {meta && <div className="flex flex-wrap items-center gap-x-1 text-sm text-white/90">{meta}</div>}
          {extra}
        </div>
      </header>

      <div
        className="relative min-h-[240px]"
        style={{ backgroundColor: color, backgroundImage: 'linear-gradient(rgba(0,0,0,0.6) 0, #121212 232px)' }}
      >
        {actions && <div className="flex items-center gap-4 px-4 py-5 md:gap-6 md:px-6">{actions}</div>}
        <div className="pb-8">{children}</div>
      </div>
    </div>
  );
};

/** Separador "•" entre os itens da linha de metadados. */
export const Dot: React.FC = () => <span className="px-0.5">•</span>;
