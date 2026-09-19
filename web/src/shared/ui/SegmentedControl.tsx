import { GlassSurface } from './glass/index.ts';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Seletor estilo iOS: o item ativo é só mais brilho, nunca uma cor (RF9.2). */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <GlassSurface radius="pill" variant="light" className={className}>
      <div className="flex gap-1 p-1" role="tablist">
        {segments.map((segment) => {
          const isActive = segment.value === value;
          return (
            <button
              key={segment.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(segment.value)}
              className={[
                'min-h-9 flex-1 rounded-full px-3 text-footnote font-semibold',
                'transition-[background-color,opacity] duration-150 active:scale-[0.97]',
                isActive
                  ? 'bg-[color:var(--glass-scrim-active)] opacity-100'
                  : 'bg-transparent opacity-60',
              ].join(' ')}
            >
              {segment.label}
            </button>
          );
        })}
      </div>
    </GlassSurface>
  );
}
