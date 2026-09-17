export const API_BASE = '/api/v1';

export const endpoints = {
  tracks: `${API_BASE}/library/tracks`,
  track: (id: string) => `${API_BASE}/library/tracks/${id}`,
  stream: (id: string) => `${API_BASE}/stream/${id}`,
  cover: (id: string) => `${API_BASE}/covers/${id}`,
  albums: `${API_BASE}/library/albums`,
  album: (id: string) => `${API_BASE}/library/albums/${id}`,
  albumCover: (id: string) => `${API_BASE}/library/albums/${id}/cover`,
  artists: `${API_BASE}/library/artists`,
  artist: (id: string) => `${API_BASE}/library/artists/${id}`,
  radio: `${API_BASE}/radio`,
  downloads: `${API_BASE}/downloads`,
  downloadJob: (id: string) => `${API_BASE}/downloads/${id}`,
  playlists: `${API_BASE}/playlists`,
  playlist: (id: string) => `${API_BASE}/playlists/${id}`,
  playlistTracks: (id: string) => `${API_BASE}/playlists/${id}/tracks`,
  playlistTrack: (id: string, trackId: string) => `${API_BASE}/playlists/${id}/tracks/${trackId}`,
  smartPlaylist: `${API_BASE}/playlists/smart`,
  scan: `${API_BASE}/library/scan`,
  health: `${API_BASE}/health`,
};
