import React from 'react';

interface CoverBackdropProps {
  /** URL da capa da faixa atual ou da tela aberta; vazio volta ao fundo neutro. */
  imageUrl: string | null;
}

/**
 * Fundo desfocado com a arte da capa (RF9.4). O vidro só se enxerga com algo colorido
 * atrás dele, e é isto que dá cor à interface sem pintar nenhum botão (RF9.2).
 */
export const CoverBackdrop: React.FC<CoverBackdropProps> = ({ imageUrl }) => (
  <div
    aria-hidden="true"
    className={`CoverBackdrop ${imageUrl ? 'CoverBackdrop--visible' : ''}`}
    style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}
  />
);
