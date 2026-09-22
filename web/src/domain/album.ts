export interface Album {
  id: string;
  artist_id: string;
  /** Nome do artista, preenchido pelas leituras do servidor. */
  artist_name?: string;
  title: string;
  year?: number;
}

export interface Artist {
  id: string;
  name: string;
}
