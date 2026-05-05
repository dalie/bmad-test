import { TestBed } from '@angular/core/testing';
import { WatchProgressService, WATCH_PROGRESS_KEY, WatchProgressEntry } from './watch-progress.service';

function makeEntry(overrides: Partial<WatchProgressEntry> = {}): WatchProgressEntry {
  return {
    position: 100,
    duration: 3600,
    watched: false,
    updatedAt: 1000000,
    mediaType: 'movie',
    id: 42,
    title: 'Test Movie',
    posterUrl: null,
    year: 2024,
    fileId: 42,
    tier: 1,
    ...overrides,
  };
}

describe('WatchProgressService', () => {
  let service: WatchProgressService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(WatchProgressService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('saveEntry', () => {
    it('should write entry under the given storage key', () => {
      const entry = makeEntry();
      service.saveEntry('movie:42', entry);

      const raw = localStorage.getItem(WATCH_PROGRESS_KEY);
      expect(raw).toBeTruthy();
      const record = JSON.parse(raw!);
      expect(record['movie:42']).toEqual(entry);
    });

    it('should merge entry into existing record without overwriting other entries', () => {
      const entryA = makeEntry({ id: 1, title: 'Movie A' });
      const entryB = makeEntry({ id: 2, title: 'Movie B' });

      service.saveEntry('movie:1', entryA);
      service.saveEntry('movie:2', entryB);

      const record = service.readAll();
      expect(record['movie:1']).toEqual(entryA);
      expect(record['movie:2']).toEqual(entryB);
    });

    it('should overwrite an existing entry under the same key', () => {
      const old = makeEntry({ position: 50 });
      const updated = makeEntry({ position: 200 });

      service.saveEntry('movie:42', old);
      service.saveEntry('movie:42', updated);

      const record = service.readAll();
      expect(record['movie:42'].position).toBe(200);
    });

    it('should handle localStorage errors gracefully (silent no-op)', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

      expect(() => service.saveEntry('movie:42', makeEntry())).not.toThrow();

      setItemSpy.mockRestore();
    });
  });

  describe('readAll', () => {
    it('should return empty object when localStorage is empty', () => {
      expect(service.readAll()).toEqual({});
    });

    it('should return parsed record from localStorage', () => {
      const entry = makeEntry();
      localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify({ 'movie:42': entry }));

      const record = service.readAll();
      expect(record['movie:42']).toEqual(entry);
    });

    it('should return empty object when localStorage value is invalid JSON', () => {
      localStorage.setItem(WATCH_PROGRESS_KEY, 'not-valid-json');
      expect(service.readAll()).toEqual({});
    });

    it('should handle localStorage getItem errors gracefully', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      expect(service.readAll()).toEqual({});

      getItemSpy.mockRestore();
    });
  });
});
