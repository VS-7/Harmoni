export interface Album {
  id: string;
  artist_id: string;
  title: string;
  year?: number;
  cover_path?: string;
}

export interface Artist {
  id: string;
  name: string;
}
