import {
  Component,
  ChangeDetectionStrategy,
  inject,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  signal,
  HostListener,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { WatchProgressService, WatchProgressEntry } from '../services/watch-progress.service';

interface ProgressContext {
  mediaType: 'movie' | 'tv';
  id: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  tier: number | null;
  seasonNum?: number;
  episodeNum?: number;
}

interface SubtitleTrackInfo {
  id: number;
  language: string | null;
}

interface AudioTrackInfo {
  index: number;
  language: string | null;
  codec: string;
  channels: number;
}

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  eng: 'English',
  fr: 'French',
  fre: 'French',
  fra: 'French',
  es: 'Spanish',
  spa: 'Spanish',
  de: 'German',
  ger: 'German',
  deu: 'German',
  it: 'Italian',
  ita: 'Italian',
  ja: 'Japanese',
  jpn: 'Japanese',
  ko: 'Korean',
  kor: 'Korean',
  zh: 'Chinese',
  chi: 'Chinese',
  zho: 'Chinese',
  pt: 'Portuguese',
  por: 'Portuguese',
  ru: 'Russian',
  rus: 'Russian',
  ar: 'Arabic',
  ara: 'Arabic',
  hi: 'Hindi',
  hin: 'Hindi',
  nl: 'Dutch',
  dut: 'Dutch',
  nld: 'Dutch',
  sv: 'Swedish',
  swe: 'Swedish',
  no: 'Norwegian',
  nor: 'Norwegian',
  da: 'Danish',
  dan: 'Danish',
  fi: 'Finnish',
  fin: 'Finnish',
  pl: 'Polish',
  pol: 'Polish',
  und: 'Unknown',
};

@Component({
  selector: 'app-player',
  standalone: true,
  imports: [],
  templateUrl: './player.component.html',
  styleUrl: './player.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerComponent implements AfterViewInit, OnDestroy {
  readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly watchProgressService = inject(WatchProgressService);
  readonly fileId = this.route.snapshot.paramMap.get('fileId');
  readonly isTier2 = this.route.snapshot.queryParamMap.get('tier') === '2';

  readonly videoSrc = `/api/media/stream/${this.fileId}`;
  readonly audioSrc = `/api/media/stream/${this.fileId}/audio`;

  subtitleTracks = signal<SubtitleTrackInfo[]>([]);
  activeSubtitleId = signal<number | null>(null);
  subtitleMenuOpen = signal<boolean>(false);

  audioTracks = signal<AudioTrackInfo[]>([]);
  activeAudioIndex = signal<number | null>(null);
  audioMenuOpen = signal<boolean>(false);

  controlsVisible = signal<boolean>(true);
  private controlsTimer: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('videoEl') videoElRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('audioEl') audioElRef!: ElementRef<HTMLAudioElement>;
  @ViewChild('subtitleControls') subtitleControlsRef?: ElementRef<HTMLElement>;
  @ViewChild('audioControls') audioControlsRef?: ElementRef<HTMLElement>;

  private rafId: number | null = null;
  private videoReady = false;
  private audioReady = false;
  private syncStarted = false;
  private isMirroring = false;
  private syncDisabled = false;
  private listeners: Array<[HTMLElement, string, EventListener]> = [];
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private pendingRestoreTimers: ReturnType<typeof setTimeout>[] = [];
  private readonly progressContext: ProgressContext | null = this.buildProgressContext();

  constructor() {
    if (this.fileId) {
      this.http.get<SubtitleTrackInfo[]>(`/api/media/${this.fileId}/subtitles`).subscribe({
        next: (tracks) => {
          this.subtitleTracks.set(tracks);
          this.restoreSubtitlePreference(tracks);
        },
        error: () => this.subtitleTracks.set([]),
      });
      this.http.get<AudioTrackInfo[]>(`/api/media/${this.fileId}/audio-tracks`).subscribe({
        next: (tracks) => {
          this.audioTracks.set(tracks);
          if (tracks.length > 0) this.activeAudioIndex.set(tracks[0].index);
          this.restoreAudioPreference(tracks);
        },
        error: () => this.audioTracks.set([]),
      });
    }
  }

  ngAfterViewInit(): void {
    const video = this.videoElRef.nativeElement;

    if (this.isTier2) {
      const audio = this.audioElRef.nativeElement;

      this.addListener(video, 'canplay', () => {
        this.videoReady = true;
        this.tryStartSync();
      });

      this.addListener(audio, 'canplay', () => {
        this.audioReady = true;
        this.tryStartSync();
      });

      // Seek sync
      this.addListener(video, 'seeking', () => {
        if (this.syncDisabled) return;
        audio.pause();
      });
      this.addListener(video, 'seeked', () => {
        if (this.syncDisabled) return;
        audio.currentTime = video.currentTime;
        if (!video.paused) audio.play().catch(() => {});
      });

      // Play/pause sync
      this.addListener(video, 'play', () => {
        if (this.syncDisabled || !this.audioReady) return;
        audio.currentTime = video.currentTime;
        audio.play().catch(() => {});
      });
      this.addListener(video, 'pause', () => {
        this.saveProgress();
        if (this.syncDisabled) return;
        audio.pause();
      });

      // Volume mirror
      this.addListener(video, 'volumechange', () => {
        if (this.syncDisabled || this.isMirroring) return;
        this.isMirroring = true;
        audio.volume = video.volume;
        if (!video.muted) {
          video.muted = true;
        }
        audio.muted = false;
        this.isMirroring = false;
      });

      // Audio error fallback — if sidecar fails, let video play unmuted
      this.addListener(audio, 'error', () => {
        this.syncDisabled = true;
        video.muted = false;
        this.cancelSync();
      });

      // Fallback: if media already loaded before listeners attached
      if (video.readyState >= 3) {
        this.videoReady = true;
      }
      if (audio.readyState >= 3) {
        this.audioReady = true;
      }
      this.tryStartSync();
    } else {
      // Non-Tier 2: save progress on pause
      this.addListener(video, 'pause', () => this.saveProgress());
    }

    // Start periodic progress saving for ALL tiers
    if (this.progressContext && this.fileId) {
      this.progressInterval = setInterval(() => this.saveProgress(), 5000);
    }

    // Apply resume position LAST — after all listeners are registered
    this.applyResumePosition();

    // Clear watched status from later episodes if rewatching a TV episode
    this.clearLaterEpisodesWatched();
  }

  ngOnDestroy(): void {
    this.saveProgress();
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    if (this.controlsTimer !== null) {
      clearTimeout(this.controlsTimer);
      this.controlsTimer = null;
    }
    for (const t of this.pendingRestoreTimers) clearTimeout(t);
    this.pendingRestoreTimers = [];
    this.cancelSync();
    for (const [el, event, handler] of this.listeners) {
      el.removeEventListener(event, handler);
    }
    this.listeners = [];
    if (this.isTier2 && this.videoElRef) {
      this.videoElRef.nativeElement.pause();
    }
    if (this.isTier2 && this.audioElRef) {
      this.audioElRef.nativeElement.pause();
    }
  }

  private addListener(el: HTMLElement, event: string, handler: EventListener): void {
    el.addEventListener(event, handler);
    this.listeners.push([el, event, handler]);
  }

  private tryStartSync(): void {
    if (this.syncStarted || !this.videoReady || !this.audioReady) return;
    this.syncStarted = true;
    const video = this.videoElRef.nativeElement;
    const audio = this.audioElRef.nativeElement;
    audio.currentTime = video.currentTime;
    audio.play().catch(() => {});
    this.syncLoop();
  }

  private syncLoop(): void {
    const video = this.videoElRef?.nativeElement;
    const audio = this.audioElRef?.nativeElement;
    if (!video || !audio) return;

    if (!video.paused) {
      const drift = video.currentTime - audio.currentTime;
      const absDrift = Math.abs(drift);
      if (absDrift > 0.3) {
        audio.currentTime = video.currentTime;
        if (audio.playbackRate !== 1.0) audio.playbackRate = 1.0;
      } else if (absDrift > 0.05) {
        audio.playbackRate = drift > 0 ? 1.02 : 0.98;
      } else if (absDrift < 0.03 && audio.playbackRate !== 1.0) {
        audio.playbackRate = 1.0;
      }
    }
    this.rafId = requestAnimationFrame(() => this.syncLoop());
  }

  private cancelSync(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private buildProgressContext(): ProgressContext | null {
    const qp = this.route.snapshot.queryParamMap;
    const mediaType = qp.get('mediaType') as 'movie' | 'tv' | null;
    if (mediaType !== 'movie' && mediaType !== 'tv') return null;

    const mediaId = parseInt(qp.get('mediaId') ?? '', 10);
    if (isNaN(mediaId)) return null;

    const tier = parseInt(qp.get('tier') ?? '', 10);

    const yearRaw = parseInt(qp.get('year') ?? '', 10);
    const seasonRaw = parseInt(qp.get('season') ?? '', 10);
    const episodeRaw = parseInt(qp.get('episode') ?? '', 10);

    return {
      mediaType,
      id: mediaId,
      title: qp.get('title') ?? 'Unknown',
      year: isNaN(yearRaw) ? null : yearRaw,
      posterUrl: qp.get('posterUrl'),
      tier: isNaN(tier) ? null : tier,
      seasonNum: mediaType === 'tv' ? (isNaN(seasonRaw) ? undefined : seasonRaw) : undefined,
      episodeNum: mediaType === 'tv' ? (isNaN(episodeRaw) ? undefined : episodeRaw) : undefined,
    };
  }

  private applyResumePosition(): void {
    if (!this.progressContext) return;
    const ctx = this.progressContext;

    // Guard: TV requires both seasonNum and episodeNum
    if (ctx.mediaType === 'tv' && (ctx.seasonNum == null || ctx.episodeNum == null)) return;

    const storageKey =
      ctx.mediaType === 'movie'
        ? `movie:${ctx.id}`
        : `tv:${ctx.id}:s${ctx.seasonNum}:e${ctx.episodeNum}`;

    const record = this.watchProgressService.readAll();
    const entry = record[storageKey];

    if (!entry || entry.duration <= 0 || entry.position <= 0) return;

    // If within last 5% of duration, start from beginning
    if (entry.position / entry.duration >= 0.95) return;

    const video = this.videoElRef?.nativeElement;
    if (!video) return;
    const seekToPosition = (): void => {
      video.currentTime = entry.position;
    };

    if (video.readyState >= 1) {
      // Metadata already loaded — seek immediately
      seekToPosition();
    } else {
      // Wait for metadata to load, then seek (one-shot, not tracked in this.listeners)
      video.addEventListener('loadedmetadata', seekToPosition, { once: true });
    }
  }

  private clearLaterEpisodesWatched(): void {
    if (!this.progressContext) return;
    const ctx = this.progressContext;
    if (ctx.mediaType !== 'tv') return;
    if (ctx.seasonNum == null || ctx.episodeNum == null) return;

    const record = this.watchProgressService.readAll();

    const currentKey = `tv:${ctx.id}:s${ctx.seasonNum}:e${ctx.episodeNum}`;
    const currentEntry = record[currentKey];

    if (!currentEntry || !currentEntry.watched) return;

    for (const [key, entry] of Object.entries(record)) {
      if (entry.mediaType !== 'tv' || entry.id !== ctx.id) continue;
      if (entry.seasonNum == null || entry.episodeNum == null) continue;
      if (!entry.watched) continue;

      const isLater =
        entry.seasonNum! > ctx.seasonNum! ||
        (entry.seasonNum === ctx.seasonNum && entry.episodeNum! > ctx.episodeNum!);

      if (isLater) {
        this.watchProgressService.saveEntry(key, {
          ...entry,
          watched: false,
          updatedAt: Date.now(),
        });
      }
    }
  }

  private saveProgress(): void {
    if (!this.progressContext) return;
    const video = this.videoElRef?.nativeElement;
    if (!video) return;
    const duration = video.duration;
    const position = video.currentTime;
    if (!duration || !isFinite(duration) || duration <= 0) return;
    if (position <= 0) return;

    const ctx = this.progressContext;
    const fileId = parseInt(this.fileId ?? '', 10);
    if (isNaN(fileId)) return;

    if (ctx.mediaType === 'tv' && (ctx.seasonNum == null || ctx.episodeNum == null)) return;

    const storageKey =
      ctx.mediaType === 'movie'
        ? `movie:${ctx.id}`
        : `tv:${ctx.id}:s${ctx.seasonNum}:e${ctx.episodeNum}`;

    const entry: WatchProgressEntry = {
      position,
      duration,
      watched: position / duration >= 0.9,
      updatedAt: Date.now(),
      mediaType: ctx.mediaType,
      id: ctx.id,
      title: ctx.title,
      posterUrl: ctx.posterUrl,
      year: ctx.year,
      fileId,
      tier: ctx.tier,
      seasonNum: ctx.seasonNum,
      episodeNum: ctx.episodeNum,
      audioTrackIndex: this.activeAudioIndex() ?? undefined,
      subtitleTrackId: this.activeSubtitleId() ?? undefined,
    };

    this.watchProgressService.saveEntry(storageKey, entry);
  }

  private getSavedEntry(): WatchProgressEntry | null {
    if (!this.progressContext) return null;
    const ctx = this.progressContext;
    if (ctx.mediaType === 'tv' && (ctx.seasonNum == null || ctx.episodeNum == null)) return null;

    const storageKey =
      ctx.mediaType === 'movie'
        ? `movie:${ctx.id}`
        : `tv:${ctx.id}:s${ctx.seasonNum}:e${ctx.episodeNum}`;

    const record = this.watchProgressService.readAll();
    return record[storageKey] ?? null;
  }

  private restoreAudioPreference(tracks: AudioTrackInfo[]): void {
    const saved = this.getSavedEntry();
    if (saved?.audioTrackIndex == null) return;
    const track = tracks.find((t) => t.index === saved.audioTrackIndex);
    if (!track) return;
    // Signal is already set to tracks[0].index above; override if saved differs
    if (track.index !== tracks[0]?.index) {
      // For Tier 2 this triggers src change; for Tier 1/3 it sets native audioTracks
      this.pendingRestoreTimers.push(setTimeout(() => this.selectAudioTrack(track), 0));
    } else {
      this.activeAudioIndex.set(track.index);
    }
  }

  private restoreSubtitlePreference(tracks: SubtitleTrackInfo[]): void {
    const saved = this.getSavedEntry();
    if (saved?.subtitleTrackId == null) return;
    const exists = tracks.some((t) => t.id === saved.subtitleTrackId);
    if (!exists) return;
    // Defer until Angular renders the <track> elements
    this.pendingRestoreTimers.push(
      setTimeout(() => this.selectSubtitle(saved.subtitleTrackId!), 0),
    );
  }

  getTrackLabel(track: SubtitleTrackInfo): string {
    if (track.language && LANG_NAMES[track.language]) {
      return LANG_NAMES[track.language];
    }
    const index = this.subtitleTracks().indexOf(track);
    return `Track ${index + 1}`;
  }

  toggleSubtitleMenu(): void {
    this.subtitleMenuOpen.update((v) => !v);
  }

  selectSubtitle(trackId: number | null): void {
    const video = this.videoElRef?.nativeElement;
    if (!video) return;

    const textTracks = video.textTracks;
    for (let i = 0; i < textTracks.length; i++) {
      textTracks[i].mode = 'disabled';
    }

    if (trackId !== null) {
      const trackIndex = this.subtitleTracks().findIndex((t) => t.id === trackId);
      if (trackIndex >= 0 && textTracks[trackIndex]) {
        textTracks[trackIndex].mode = 'showing';
      }
    }

    this.activeSubtitleId.set(trackId);
    this.subtitleMenuOpen.set(false);
  }

  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.subtitleMenuOpen.set(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = (event.currentTarget as HTMLElement).querySelectorAll('[role="menuitemradio"]');
      const focused = document.activeElement;
      const currentIndex = Array.from(items).indexOf(focused as Element);
      const next =
        event.key === 'ArrowDown'
          ? (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length;
      (items[next] as HTMLElement).focus();
    }
  }

  toggleAudioMenu(): void {
    this.audioMenuOpen.update((v) => !v);
  }

  selectAudioTrack(track: AudioTrackInfo): void {
    if (this.isTier2) {
      const audio = this.audioElRef?.nativeElement;
      const video = this.videoElRef?.nativeElement;
      if (!audio || !video) return;

      const savedTime = video.currentTime;
      const wasPlaying = !video.paused;

      // Use array position (not absolute stream index) to match backend sidecar naming convention
      const position = this.audioTracks().findIndex((t) => t.index === track.index);
      if (position === -1) return;
      const trackUrl =
        position === 0
          ? `/api/media/stream/${this.fileId}/audio`
          : `/api/media/stream/${this.fileId}/audio?trackIndex=${position}`;

      // If sync was disabled by a prior audio error, re-enable for the new track attempt
      if (this.syncDisabled) {
        this.syncDisabled = false;
        video.muted = true;
      }

      audio.pause();
      audio.src = trackUrl;
      audio.load();
      // Seek and resume inside loadedmetadata — synchronous assignment after load() is discarded by browsers
      audio.addEventListener(
        'loadedmetadata',
        () => {
          audio.currentTime = savedTime;
          if (wasPlaying) {
            audio.play().catch((e) => {
              if (e?.name !== 'AbortError') {
                this.syncDisabled = true;
                video.muted = false;
                this.cancelSync();
              }
            });
            // Restart sync loop if it was previously cancelled by an error
            if (this.rafId === null) {
              this.syncLoop();
            }
          }
        },
        { once: true },
      );
    } else {
      const video = this.videoElRef?.nativeElement;
      if (!video) return;
      // AudioTrackList is not in standard TS lib for HTMLVideoElement; cast to any
      // Note: Chrome exposes audioTracks only for certain media sources (MSE/DASH/HLS).
      // For plain range-served MP4/MKV this is typically undefined or empty — silent no-op.
      const nativeTracks = (video as any).audioTracks as
        | { length: number; [index: number]: { enabled: boolean } }
        | undefined;
      if (nativeTracks && nativeTracks.length > 0) {
        const selectedPos = this.audioTracks().findIndex((t) => t.index === track.index);
        if (selectedPos === -1) return;
        for (let i = 0; i < nativeTracks.length; i++) {
          nativeTracks[i].enabled = i === selectedPos;
        }
      }
      // If native audioTracks not available: silent no-op (graceful degradation)
    }

    this.activeAudioIndex.set(track.index);
    this.audioMenuOpen.set(false);
  }

  getAudioTrackLabel(track: AudioTrackInfo): string {
    if (track.language && LANG_NAMES[track.language]) {
      return LANG_NAMES[track.language];
    }
    const index = this.audioTracks().findIndex((t) => t.index === track.index);
    return index >= 0 ? `Track ${index + 1}` : 'Track ?';
  }

  onAudioMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.audioMenuOpen.set(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = (event.currentTarget as HTMLElement).querySelectorAll('[role="menuitemradio"]');
      const focused = document.activeElement;
      const currentIndex = Array.from(items).indexOf(focused as Element);
      const next =
        event.key === 'ArrowDown'
          ? (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length;
      (items[next] as HTMLElement).focus();
    }
  }

  @HostListener('mousemove')
  @HostListener('click')
  @HostListener('touchstart')
  onMouseActivity(): void {
    this.controlsVisible.set(true);
    if (this.controlsTimer !== null) clearTimeout(this.controlsTimer);
    if (this.subtitleMenuOpen() || this.audioMenuOpen()) return;
    this.controlsTimer = setTimeout(() => {
      this.controlsVisible.set(false);
      this.controlsTimer = null;
    }, 3000);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.subtitleMenuOpen() && this.subtitleControlsRef) {
      if (!this.subtitleControlsRef.nativeElement.contains(event.target as Node)) {
        this.subtitleMenuOpen.set(false);
      }
    }
    if (this.audioMenuOpen() && this.audioControlsRef) {
      if (!this.audioControlsRef.nativeElement.contains(event.target as Node)) {
        this.audioMenuOpen.set(false);
      }
    }
  }
}
