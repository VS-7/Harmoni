/**
 * Preferências por aparelho (volume, recentes, sidebar recolhida...). O localStorage pode
 * estar bloqueado ou vazio numa aba anônima, então toda leitura e escrita tolera falhas
 * e o app continua funcionando com os valores padrão.
 */
const PREFIX = 'harmoni:';

export const preferences = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },

  set<T>(key: string, value: T): void {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Sem armazenamento a preferência vale só para esta sessão.
    }
  },
};
