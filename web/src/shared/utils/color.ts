import { hashString } from './random.ts';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Paleta dos cards de rádio e categorias, no tom vivo dos cards do Spotify. */
const CARD_PALETTE = [
  '#e13300',
  '#dc148c',
  '#8400e7',
  '#1e3264',
  '#608108',
  '#e8115b',
  '#148a08',
  '#bc5900',
  '#509bf5',
  '#27856a',
  '#8d67ab',
  '#ba5d07',
  '#e91429',
  '#477d95',
  '#af2896',
  '#0d73ec',
];

/** Cor viva e estável para um nome (cards de rádio, categorias). */
export function paletteColor(key: string): string {
  return CARD_PALETTE[hashString(key) % CARD_PALETTE.length];
}

/** Cor escura e estável para o fundo de uma página sem capa. */
export function fallbackColor(key: string): string {
  const hue = hashString(key) % 360;
  return `hsl(${hue} 38% 32%)`;
}

export function rgbToCss({ r, g, b }: RGB, alpha = 1): string {
  return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

function rgbToHsl({ r, g, b }: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

/**
 * Escolhe a cor de destaque de uma capa como o Spotify faz nos cabeçalhos: favorece
 * pixels saturados e de luminosidade média, e escurece o resultado para o texto branco
 * continuar legível por cima.
 */
export function pickAccent(pixels: Uint8ClampedArray): RGB | null {
  const buckets = new Map<number, { weight: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const color = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
    const [, s, l] = rgbToHsl(color);
    // Quase preto ou quase branco não serve de cor de destaque.
    if (l < 0.08 || l > 0.92) continue;
    // A saturação pesa ao quadrado: poucos pixels vivos (o dourado de uma capa escura)
    // vencem muitos cinzas, que é o que faz o degradê do Spotify parecer "da capa".
    const vivid = s * s * 6;
    const weight = (0.04 + vivid) * Math.max(0.15, 1 - Math.abs(l - 0.5) * 1.5);
    const key = ((color.r >> 5) << 6) | ((color.g >> 5) << 3) | (color.b >> 5);
    const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 };
    bucket.weight += weight;
    bucket.r += color.r * weight;
    bucket.g += color.g * weight;
    bucket.b += color.b * weight;
    buckets.set(key, bucket);
  }

  let best: { weight: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.weight > best.weight) best = bucket;
  }
  if (!best || best.weight === 0) return null;

  const average = { r: best.r / best.weight, g: best.g / best.weight, b: best.b / best.weight };
  const [h, s, l] = rgbToHsl(average);
  return hslToRgb(h, Math.min(0.75, s * 1.1), Math.min(0.42, Math.max(0.22, l * 0.8)));
}
