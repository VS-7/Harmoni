import type { Track } from '../../domain/track.ts';
import { offlineStorage } from '../storage/offline_store.ts';
import { apiClient } from '../api/client.ts';

export interface AudioEngineCallbacks {
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onEnded: () => void;
  onPlay: () => void;
  onPause: () => void;
  onError: (err: string) => void;
  onLoading: () => void;
}

export class AudioEngine {
  private audio: HTMLAudioElement;
  private currentObjectUrl: string | null = null;
  private callbacks: AudioEngineCallbacks | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.setupListeners();
  }

  public setCallbacks(callbacks: AudioEngineCallbacks) {
    this.callbacks = callbacks;
  }

  private setupListeners() {
    this.audio.addEventListener('timeupdate', () => {
      if (this.callbacks && !isNaN(this.audio.currentTime)) {
        this.callbacks.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.callbacks) this.callbacks.onEnded();
    });

    this.audio.addEventListener('play', () => {
      if (this.callbacks) this.callbacks.onPlay();
    });

    // Depois de um 'waiting' (buffering) só vem 'playing', não 'play': sem isto o player
    // ficaria preso em "carregando" enquanto o áudio já toca.
    this.audio.addEventListener('playing', () => {
      if (this.callbacks) this.callbacks.onPlay();
    });

    this.audio.addEventListener('pause', () => {
      if (this.callbacks) this.callbacks.onPause();
    });

    this.audio.addEventListener('waiting', () => {
      if (this.callbacks) this.callbacks.onLoading();
    });

    this.audio.addEventListener('error', () => {
      if (this.callbacks) {
        const errorMsg = this.audio.error?.message || 'Erro ao carregar ou reproduzir áudio';
        this.callbacks.onError(errorMsg);
      }
    });
  }

  // Hybrid Online/Offline loading (Guardrail 6 & RF5.3)
  public async loadTrack(track: Track): Promise<boolean> {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    try {
      if (this.callbacks) this.callbacks.onLoading();

      // 1. Check IndexedDB offline store first
      const offlineItem = await offlineStorage.getTrack(track.id);
      if (offlineItem && offlineItem.blob) {
        this.currentObjectUrl = URL.createObjectURL(offlineItem.blob);
        this.audio.src = this.currentObjectUrl;
        return true; // Playing from local offline storage!
      }

      // 2. Fallback to server stream
      this.audio.src = apiClient.getStreamUrl(track.id);
      return false; // Playing from network
    } catch {
      this.audio.src = apiClient.getStreamUrl(track.id);
      return false;
    }
  }

  public async play(): Promise<void> {
    try {
      await this.audio.play();
    } catch (err) {
      if (this.callbacks) {
        this.callbacks.onError((err as Error).message);
      }
    }
  }

  public pause() {
    this.audio.pause();
  }

  public seek(seconds: number) {
    if (!isNaN(seconds) && isFinite(seconds)) {
      this.audio.currentTime = seconds;
    }
  }

  public setVolume(volume: number) {
    this.audio.volume = Math.min(Math.max(0, volume), 1);
  }

  public setMuted(muted: boolean) {
    this.audio.muted = muted;
  }

  public getCurrentTime(): number {
    return this.audio.currentTime || 0;
  }

  public getDuration(): number {
    return this.audio.duration || 0;
  }
}

export const audioEngine = new AudioEngine();
