import { Injectable } from '@angular/core';

export const WATCH_PROGRESS_KEY = 'cineplex_progress';

export interface WatchProgressEntry {
  position: number;
  duration: number;
  watched: boolean;
  updatedAt: number;
  mediaType: 'movie' | 'tv';
  id: number;
  title: string;
  posterUrl: string | null;
  year: number | null;
  fileId: number;
  tier: number | null;
  seasonNum?: number;
  episodeNum?: number;
}

export type WatchProgressRecord = Record<string, WatchProgressEntry>;

@Injectable({ providedIn: 'root' })
export class WatchProgressService {
  readAll(): WatchProgressRecord {
    try {
      const raw = localStorage.getItem(WATCH_PROGRESS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed as WatchProgressRecord;
    } catch {
      return {};
    }
  }

  saveEntry(storageKey: string, entry: WatchProgressEntry): void {
    try {
      const raw = localStorage.getItem(WATCH_PROGRESS_KEY);
      let record: WatchProgressRecord = {};
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          record = parsed as WatchProgressRecord;
        }
      }
      record[storageKey] = entry;
      localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(record));
    } catch {
      // localStorage may be unavailable (private browsing, storage quota, etc.) — silent no-op
    }
  }
}
