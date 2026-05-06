import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PlayerComponent } from './player.component';
import { WatchProgressService } from '../services/watch-progress.service';

interface AudioTrackInfo {
  index: number;
  language: string | null;
  codec: string;
  channels: number;
}

function makeActivatedRouteStub(
  fileId: string,
  tier?: string,
  extraQueryParams: Record<string, string> = {},
) {
  const paramMap = convertToParamMap({ fileId });
  const queryParamMap = convertToParamMap(
    tier ? { tier, ...extraQueryParams } : { ...extraQueryParams },
  );
  return {
    snapshot: { paramMap, queryParamMap },
    paramMap: of(paramMap),
    queryParamMap: of(queryParamMap),
  };
}

describe('PlayerComponent', () => {
  let mockLocation: Pick<Location, 'back'>;
  let httpTesting: HttpTestingController;

  function setup(
    fileId = '42',
    tier?: string,
    subtitleTracks: Array<{ id: number; language: string | null }> = [],
    audioTracks: AudioTrackInfo[] = [],
    extraQueryParams: Record<string, string> = {},
  ) {
    mockLocation = { back: vi.fn() };
    const watchProgressMock = { saveEntry: vi.fn(), readAll: vi.fn().mockReturnValue({}) };

    TestBed.configureTestingModule({
      imports: [PlayerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: makeActivatedRouteStub(fileId, tier, extraQueryParams),
        },
        { provide: Location, useValue: mockLocation },
        { provide: WatchProgressService, useValue: watchProgressMock },
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PlayerComponent);
    fixture.detectChanges();

    // Must flush both requests in constructor order: subtitles first, then audio tracks
    const subReq = httpTesting.expectOne(`/api/media/${fileId}/subtitles`);
    subReq.flush(subtitleTracks);

    const audioReq = httpTesting.expectOne(`/api/media/${fileId}/audio-tracks`);
    audioReq.flush(audioTracks);

    fixture.detectChanges();

    return fixture;
  }

  afterEach(() => {
    httpTesting?.verify();
  });

  it('should create the component', () => {
    const fixture = setup();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should read fileId from route params', () => {
    const fixture = setup('42');
    expect(fixture.componentInstance.fileId).toBe('42');
  });

  it('should call location.back() when back button is clicked', () => {
    const fixture = setup();
    const backBtn = fixture.nativeElement.querySelector('.back-link') as HTMLButtonElement;
    backBtn.click();
    expect(mockLocation.back).toHaveBeenCalled();
  });

  describe('Standard mode (tier != 2)', () => {
    it('should render a single video element without muted attribute', () => {
      const fixture = setup('42');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      expect(video).toBeTruthy();
      expect(video.hasAttribute('muted')).toBe(false);
    });

    it('should have no audio element', () => {
      const fixture = setup('42');
      const audio = fixture.nativeElement.querySelector('audio');
      expect(audio).toBeNull();
    });

    it('should have controls attribute on video', () => {
      const fixture = setup('42');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      expect(video.hasAttribute('controls')).toBe(true);
    });

    it('should have autoplay attribute on video', () => {
      const fixture = setup('42');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      expect(video.hasAttribute('autoplay')).toBe(true);
    });

    it('should have preload="auto" on video', () => {
      const fixture = setup('42');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      expect(video.getAttribute('preload')).toBe('auto');
    });

    it('should set video src to streaming endpoint', () => {
      const fixture = setup('42');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      expect(video.getAttribute('src')).toBe('/api/media/stream/42');
    });

    it('should also work when tier=1', () => {
      const fixture = setup('42', '1');
      const audio = fixture.nativeElement.querySelector('audio');
      expect(audio).toBeNull();
    });

    it('should also work when tier=3', () => {
      const fixture = setup('42', '3');
      const audio = fixture.nativeElement.querySelector('audio');
      expect(audio).toBeNull();
    });
  });

  describe('Dual-element mode (tier = 2)', () => {
    it('should render video with muted attribute', () => {
      const fixture = setup('99', '2');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      expect(video).toBeTruthy();
      expect(video.hasAttribute('muted')).toBe(true);
    });

    it('should render an audio element', () => {
      const fixture = setup('99', '2');
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
      expect(audio).toBeTruthy();
    });

    it('should set video src correctly', () => {
      const fixture = setup('99', '2');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      expect(video.getAttribute('src')).toBe('/api/media/stream/99');
    });

    it('should set audio src to sidecar endpoint', () => {
      const fixture = setup('99', '2');
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
      expect(audio.getAttribute('src')).toBe('/api/media/stream/99/audio');
    });

    it('should have autoplay on video', () => {
      const fixture = setup('99', '2');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      expect(video.hasAttribute('autoplay')).toBe(true);
    });

    it('should have controls on video', () => {
      const fixture = setup('99', '2');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      expect(video.hasAttribute('controls')).toBe(true);
    });

    it('should have preload="auto" on audio', () => {
      const fixture = setup('99', '2');
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
      expect(audio.getAttribute('preload')).toBe('auto');
    });
  });

  describe('Subtitle track selection', () => {
    const TRACKS = [
      { id: 1, language: 'eng' },
      { id: 2, language: 'fra' },
    ];

    it('should hide CC button when no subtitle tracks available', () => {
      const fixture = setup('42', undefined, []);
      const ccButton = fixture.nativeElement.querySelector('.cc-button');
      expect(ccButton).toBeNull();
    });

    it('should show CC button when subtitle tracks are available', () => {
      const fixture = setup('42', undefined, TRACKS);
      const ccButton = fixture.nativeElement.querySelector('.cc-button');
      expect(ccButton).toBeTruthy();
    });

    it('should open dropdown on CC button click', () => {
      const fixture = setup('42', undefined, TRACKS);
      const ccButton = fixture.nativeElement.querySelector('.cc-button') as HTMLButtonElement;
      ccButton.click();
      fixture.detectChanges();
      const menu = fixture.nativeElement.querySelector('.subtitle-menu');
      expect(menu).toBeTruthy();
    });

    it('should render correct track labels in dropdown', () => {
      const fixture = setup('42', undefined, TRACKS);
      const ccButton = fixture.nativeElement.querySelector('.cc-button') as HTMLButtonElement;
      ccButton.click();
      fixture.detectChanges();
      const items = fixture.nativeElement.querySelectorAll('.subtitle-menu__item');
      // "Off" + 2 tracks = 3 items
      expect(items.length).toBe(3);
      expect(items[0].textContent.trim()).toBe('Off');
      expect(items[1].textContent.trim()).toBe('English');
      expect(items[2].textContent.trim()).toBe('French');
    });

    it('should set TextTrack.mode to showing when selecting a track', () => {
      const fixture = setup('42', undefined, TRACKS);
      const component = fixture.componentInstance;
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;

      // Mock textTracks
      const mockTextTracks = [{ mode: 'disabled' }, { mode: 'disabled' }];
      Object.defineProperty(video, 'textTracks', { value: mockTextTracks });

      component.selectSubtitle(1);
      expect(mockTextTracks[0].mode).toBe('showing');
      expect(mockTextTracks[1].mode).toBe('disabled');
    });

    it('should set all TextTrack.mode to disabled when selecting Off', () => {
      const fixture = setup('42', undefined, TRACKS);
      const component = fixture.componentInstance;
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;

      const mockTextTracks = [{ mode: 'showing' }, { mode: 'disabled' }];
      Object.defineProperty(video, 'textTracks', { value: mockTextTracks });

      component.selectSubtitle(null);
      expect(mockTextTracks[0].mode).toBe('disabled');
      expect(mockTextTracks[1].mode).toBe('disabled');
      expect(component.activeSubtitleId()).toBeNull();
    });

    it('should render <track> elements with correct src and srclang', () => {
      const fixture = setup('42', undefined, TRACKS);
      const tracks = fixture.nativeElement.querySelectorAll('track');
      expect(tracks.length).toBe(2);
      expect(tracks[0].getAttribute('src')).toBe('/api/media/subtitles/1');
      expect(tracks[0].getAttribute('srclang')).toBe('eng');
      expect(tracks[1].getAttribute('src')).toBe('/api/media/subtitles/2');
      expect(tracks[1].getAttribute('srclang')).toBe('fra');
    });

    it('should close dropdown after selection', () => {
      const fixture = setup('42', undefined, TRACKS);
      const component = fixture.componentInstance;
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'textTracks', {
        value: [{ mode: 'disabled' }, { mode: 'disabled' }],
      });

      component.subtitleMenuOpen.set(true);
      component.selectSubtitle(1);
      expect(component.subtitleMenuOpen()).toBe(false);
    });

    it('should close dropdown on Escape key', () => {
      const fixture = setup('42', undefined, TRACKS);
      const component = fixture.componentInstance;
      component.subtitleMenuOpen.set(true);
      fixture.detectChanges();

      const menu = fixture.nativeElement.querySelector('.subtitle-menu') as HTMLElement;
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      menu.dispatchEvent(event);
      fixture.detectChanges();

      expect(component.subtitleMenuOpen()).toBe(false);
    });

    it('should not fetch subtitles when fileId is missing', () => {
      mockLocation = { back: vi.fn() };

      TestBed.configureTestingModule({
        imports: [PlayerComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: makeActivatedRouteStub('', undefined) },
          { provide: Location, useValue: mockLocation },
        ],
      });

      httpTesting = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(PlayerComponent);
      fixture.detectChanges();

      // No HTTP requests should have been made (fileId is empty string which is falsy)
      httpTesting.expectNone((req) => req.url.includes('/subtitles'));
      httpTesting.expectNone((req) => req.url.includes('/audio-tracks'));
    });

    it('should handle subtitle fetch error gracefully', () => {
      mockLocation = { back: vi.fn() };

      TestBed.configureTestingModule({
        imports: [PlayerComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: makeActivatedRouteStub('42', undefined) },
          { provide: Location, useValue: mockLocation },
        ],
      });

      httpTesting = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(PlayerComponent);
      fixture.detectChanges();

      const req = httpTesting.expectOne('/api/media/42/subtitles');
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });

      const audioReq = httpTesting.expectOne('/api/media/42/audio-tracks');
      audioReq.flush([]);

      fixture.detectChanges();

      const ccButton = fixture.nativeElement.querySelector('.cc-button');
      expect(ccButton).toBeNull();
      expect(fixture.componentInstance.subtitleTracks()).toEqual([]);
    });
  });

  describe('Sync loop drift correction', () => {
    it('should correct audio when drift exceeds 300ms', () => {
      const fixture = setup('99', '2');
      const component = fixture.componentInstance as any;
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;

      // Simulate drift > 0.3s (hard correction threshold)
      Object.defineProperty(video, 'currentTime', { value: 10.0, writable: true });
      Object.defineProperty(video, 'paused', { value: false });
      Object.defineProperty(audio, 'currentTime', { value: 9.5, writable: true });

      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
      component.videoReady = true;
      component.audioReady = true;
      component.syncLoop();
      rafSpy.mockRestore();

      expect(audio.currentTime).toBe(10.0);
    });

    it('should NOT correct audio when drift is within 30ms', () => {
      const fixture = setup('99', '2');
      const component = fixture.componentInstance as any;
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;

      Object.defineProperty(video, 'currentTime', { value: 10.0, writable: true });
      Object.defineProperty(video, 'paused', { value: false });
      Object.defineProperty(audio, 'currentTime', { value: 9.97, writable: true });

      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
      component.syncLoop();
      rafSpy.mockRestore();

      expect(audio.currentTime).toBe(9.97);
    });
  });

  describe('Seek synchronization', () => {
    it('should pause audio on video seeking event', () => {
      const fixture = setup('99', '2');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
      const pauseSpy = vi.spyOn(audio, 'pause');

      video.dispatchEvent(new Event('seeking'));
      expect(pauseSpy).toHaveBeenCalled();
    });

    it('should sync audio currentTime on video seeked event', () => {
      const fixture = setup('99', '2');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;

      Object.defineProperty(video, 'currentTime', { value: 30.0, writable: true });
      Object.defineProperty(audio, 'currentTime', { value: 0, writable: true });

      video.dispatchEvent(new Event('seeked'));
      expect(audio.currentTime).toBe(30.0);
    });
  });

  describe('Play/pause synchronization', () => {
    it('should play audio when video play event fires', () => {
      const fixture = setup('99', '2');
      const component = fixture.componentInstance as any;
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
      const playSpy = vi.spyOn(audio, 'play').mockResolvedValue(undefined);

      component.audioReady = true;
      Object.defineProperty(video, 'currentTime', { value: 5.0, writable: true });
      Object.defineProperty(audio, 'currentTime', { value: 0, writable: true });

      video.dispatchEvent(new Event('play'));
      expect(playSpy).toHaveBeenCalled();
      expect(audio.currentTime).toBe(5.0);
    });

    it('should pause audio when video pause event fires', () => {
      const fixture = setup('99', '2');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
      const pauseSpy = vi.spyOn(audio, 'pause');

      video.dispatchEvent(new Event('pause'));
      expect(pauseSpy).toHaveBeenCalled();
    });
  });

  describe('Volume mirroring', () => {
    it('should mirror video volume to audio', () => {
      const fixture = setup('99', '2');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;

      Object.defineProperty(video, 'volume', { value: 0.7, writable: true });
      Object.defineProperty(video, 'muted', { value: true, writable: true });

      video.dispatchEvent(new Event('volumechange'));
      expect(audio.volume).toBe(0.7);
    });

    it('should re-mute video if user unmutes it', () => {
      const fixture = setup('99', '2');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;

      Object.defineProperty(video, 'volume', { value: 0.5, writable: true });
      Object.defineProperty(video, 'muted', { value: false, writable: true });

      video.dispatchEvent(new Event('volumechange'));
      expect(video.muted).toBe(true);
      expect(audio.muted).toBe(false);
    });
  });

  describe('Audio track selection', () => {
    const AUDIO_TRACKS: AudioTrackInfo[] = [
      { index: 1, language: 'jpn', codec: 'ac3', channels: 6 },
      { index: 2, language: 'eng', codec: 'ac3', channels: 2 },
    ];

    it('should hide AUDIO button when 0 audio tracks available', () => {
      const fixture = setup('42', undefined, [], []);
      const audioButton = fixture.nativeElement.querySelector('.audio-button');
      expect(audioButton).toBeNull();
    });

    it('should hide AUDIO button when only 1 audio track available', () => {
      const fixture = setup(
        '42',
        undefined,
        [],
        [{ index: 0, language: 'eng', codec: 'aac', channels: 2 }],
      );
      const audioButton = fixture.nativeElement.querySelector('.audio-button');
      expect(audioButton).toBeNull();
    });

    it('should show AUDIO button when 2+ audio tracks available', () => {
      const fixture = setup('42', undefined, [], AUDIO_TRACKS);
      const audioButton = fixture.nativeElement.querySelector('.audio-button');
      expect(audioButton).toBeTruthy();
    });

    it('should open dropdown on AUDIO button click', () => {
      const fixture = setup('42', undefined, [], AUDIO_TRACKS);
      const audioButton = fixture.nativeElement.querySelector('.audio-button') as HTMLButtonElement;
      audioButton.click();
      fixture.detectChanges();
      const menu = fixture.nativeElement.querySelector('.audio-menu');
      expect(menu).toBeTruthy();
    });

    it('should render correct track labels in dropdown', () => {
      const fixture = setup('42', undefined, [], AUDIO_TRACKS);
      const audioButton = fixture.nativeElement.querySelector('.audio-button') as HTMLButtonElement;
      audioButton.click();
      fixture.detectChanges();
      const items = fixture.nativeElement.querySelectorAll('.audio-menu__item');
      expect(items.length).toBe(2);
      expect(items[0].textContent.trim()).toBe('Japanese');
      expect(items[1].textContent.trim()).toBe('English');
    });

    it('should use "Track N" fallback label when language is null', () => {
      const tracks: AudioTrackInfo[] = [
        { index: 0, language: null, codec: 'aac', channels: 2 },
        { index: 1, language: null, codec: 'aac', channels: 2 },
      ];
      const fixture = setup('42', undefined, [], tracks);
      const component = fixture.componentInstance;
      expect(component.getAudioTrackLabel(tracks[0])).toBe('Track 1');
      expect(component.getAudioTrackLabel(tracks[1])).toBe('Track 2');
    });

    it('should close dropdown after track selection', () => {
      const fixture = setup('42', undefined, [], AUDIO_TRACKS);
      const component = fixture.componentInstance;
      component.audioMenuOpen.set(true);
      component.selectAudioTrack(AUDIO_TRACKS[0]);
      expect(component.audioMenuOpen()).toBe(false);
    });

    it('should update activeAudioIndex after track selection', () => {
      const fixture = setup('42', undefined, [], AUDIO_TRACKS);
      const component = fixture.componentInstance;
      component.selectAudioTrack(AUDIO_TRACKS[1]);
      expect(component.activeAudioIndex()).toBe(2);
    });

    it('should close dropdown on Escape key', () => {
      const fixture = setup('42', undefined, [], AUDIO_TRACKS);
      const component = fixture.componentInstance;
      component.audioMenuOpen.set(true);
      fixture.detectChanges();

      const menu = fixture.nativeElement.querySelector('.audio-menu') as HTMLElement;
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      menu.dispatchEvent(event);
      fixture.detectChanges();

      expect(component.audioMenuOpen()).toBe(false);
    });

    it('should handle audio fetch error gracefully (no AUDIO button shown)', () => {
      mockLocation = { back: vi.fn() };

      TestBed.configureTestingModule({
        imports: [PlayerComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: makeActivatedRouteStub('42', undefined) },
          { provide: Location, useValue: mockLocation },
        ],
      });

      httpTesting = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(PlayerComponent);
      fixture.detectChanges();

      const subReq = httpTesting.expectOne('/api/media/42/subtitles');
      subReq.flush([]);

      const audioReq = httpTesting.expectOne('/api/media/42/audio-tracks');
      audioReq.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });

      fixture.detectChanges();

      const audioButton = fixture.nativeElement.querySelector('.audio-button');
      expect(audioButton).toBeNull();
      expect(fixture.componentInstance.audioTracks()).toEqual([]);
    });

    it('should not fetch audio tracks when fileId is missing', () => {
      mockLocation = { back: vi.fn() };

      TestBed.configureTestingModule({
        imports: [PlayerComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: makeActivatedRouteStub('', undefined) },
          { provide: Location, useValue: mockLocation },
        ],
      });

      httpTesting = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(PlayerComponent);
      fixture.detectChanges();

      httpTesting.expectNone((req) => req.url.includes('/audio-tracks'));
    });

    describe('Tier 2 mode track switching', () => {
      it('should change audio element src when selecting a non-primary track in Tier 2 mode', () => {
        const fixture = setup('42', '2', [], AUDIO_TRACKS);
        const component = fixture.componentInstance;
        const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;

        const savedSrc = audio.src;
        component.selectAudioTrack(AUDIO_TRACKS[1]);

        expect(audio.src).toContain('/api/media/stream/42/audio?trackIndex=1');
        expect(audio.src).not.toBe(savedSrc);
      });

      it('should use base sidecar URL (no trackIndex param) for primary track in Tier 2 mode', () => {
        const fixture = setup('42', '2', [], AUDIO_TRACKS);
        const component = fixture.componentInstance;
        const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;

        // Set to a different src first
        audio.src = '/some/other/url';
        component.selectAudioTrack(AUDIO_TRACKS[0]);

        expect(audio.src).toContain('/api/media/stream/42/audio');
        expect(audio.src).not.toContain('trackIndex');
      });

      it('should preserve currentTime when switching tracks in Tier 2 mode', () => {
        const fixture = setup('42', '2', [], AUDIO_TRACKS);
        const component = fixture.componentInstance;
        const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
        const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;

        Object.defineProperty(video, 'currentTime', { value: 45.5, writable: true });
        Object.defineProperty(audio, 'currentTime', { value: 0, writable: true });

        component.selectAudioTrack(AUDIO_TRACKS[1]);

        // Simulate browser firing loadedmetadata once new audio source is ready
        audio.dispatchEvent(new Event('loadedmetadata'));

        expect(audio.currentTime).toBe(45.5);
      });
    });

    describe('Standard mode (Tier 1/3) track switching', () => {
      it('should no-op gracefully when native audioTracks API is not available', () => {
        const fixture = setup('42', undefined, [], AUDIO_TRACKS);
        const component = fixture.componentInstance;
        const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;

        // Simulate no native audioTracks API
        Object.defineProperty(video, 'audioTracks', { value: undefined, configurable: true });

        expect(() => component.selectAudioTrack(AUDIO_TRACKS[0])).not.toThrow();
        expect(component.activeAudioIndex()).toBe(1);
      });

      it('should enable selected native track and disable others when API is available', () => {
        const fixture = setup('42', undefined, [], AUDIO_TRACKS);
        const component = fixture.componentInstance;
        const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;

        const nativeTracks = [{ enabled: true }, { enabled: false }];
        Object.defineProperty(video, 'audioTracks', {
          value: { length: 2, 0: nativeTracks[0], 1: nativeTracks[1] },
          configurable: true,
        });

        component.selectAudioTrack(AUDIO_TRACKS[1]);

        expect(nativeTracks[0].enabled).toBe(false);
        expect(nativeTracks[1].enabled).toBe(true);
      });
    });
  });

  describe('Progress saving', () => {
    const movieQueryParams = {
      mediaType: 'movie',
      mediaId: '42',
      title: 'Test Movie',
      year: '2024',
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
    };

    const tvQueryParams = {
      mediaType: 'tv',
      mediaId: '7',
      season: '2',
      episode: '3',
      title: 'Test Show',
      year: '2022',
      posterUrl: null as unknown as string,
    };

    function setupVideoState(
      fixture: ReturnType<typeof setup>,
      currentTime: number,
      duration: number,
    ): HTMLVideoElement {
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', {
        value: currentTime,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(video, 'duration', {
        value: duration,
        writable: true,
        configurable: true,
      });
      return video;
    }

    it('should save entry with movie key when mediaType is movie', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 120, 3600);

      component.saveProgress();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'movie:42',
        expect.objectContaining({ mediaType: 'movie', id: 42, fileId: 42 }),
      );
    });

    it('should save entry with tv key when mediaType is tv', () => {
      const fixture = setup('99', '1', [], [], tvQueryParams as Record<string, string>);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 300, 3600);

      component.saveProgress();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'tv:7:s2:e3',
        expect.objectContaining({ mediaType: 'tv', id: 7, seasonNum: 2, episodeNum: 3 }),
      );
    });

    it('should be a no-op when progressContext is null (missing mediaType param)', () => {
      const fixture = setup('42', '1');
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 120, 3600);

      component.saveProgress();

      expect(watchSvc.saveEntry).not.toHaveBeenCalled();
    });

    it('should be a no-op when video duration is 0', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 120, 0);

      component.saveProgress();

      expect(watchSvc.saveEntry).not.toHaveBeenCalled();
    });

    it('should be a no-op when video duration is NaN', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 120, NaN);

      component.saveProgress();

      expect(watchSvc.saveEntry).not.toHaveBeenCalled();
    });

    it('should be a no-op when video currentTime is 0', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 0, 3600);

      component.saveProgress();

      expect(watchSvc.saveEntry).not.toHaveBeenCalled();
    });

    it('should clear interval in ngOnDestroy', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const clearSpy = vi.spyOn(globalThis, 'clearInterval');

      // Manually set a fake interval so we can verify it gets cleared
      component.progressInterval = 999;
      fixture.destroy();

      expect(clearSpy).toHaveBeenCalledWith(999);
      clearSpy.mockRestore();
    });

    it('should call saveProgress on video pause event (non-Tier 2)', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const saveSpy = vi.spyOn(component, 'saveProgress');
      setupVideoState(fixture, 120, 3600);

      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      video.dispatchEvent(new Event('pause'));

      expect(saveSpy).toHaveBeenCalled();
    });

    it('should call saveProgress on video pause event (Tier 2)', () => {
      const fixture = setup('42', '2', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const saveSpy = vi.spyOn(component, 'saveProgress');
      setupVideoState(fixture, 120, 3600);

      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      video.dispatchEvent(new Event('pause'));

      expect(saveSpy).toHaveBeenCalled();
    });
  });

  describe('Resume from saved position', () => {
    const movieQueryParams = {
      mediaType: 'movie',
      mediaId: '42',
      title: 'Test Movie',
      year: '2024',
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
    };

    it('should seek video to saved position on load', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      watchSvc.readAll.mockReturnValue({
        'movie:42': {
          position: 300,
          duration: 3600,
          watched: false,
          updatedAt: Date.now(),
          mediaType: 'movie',
          id: 42,
          title: 'Test Movie',
          year: 2024,
          posterUrl: null,
          fileId: 42,
          tier: 1,
        },
      });
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

      const component = fixture.componentInstance as any;
      component.applyResumePosition();

      expect(video.currentTime).toBe(300);
    });

    it('should NOT seek when position is in last 5% of duration', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      watchSvc.readAll.mockReturnValue({
        'movie:42': {
          position: 3420,
          duration: 3600,
          watched: false,
          updatedAt: Date.now(),
          mediaType: 'movie',
          id: 42,
          title: 'Test Movie',
          year: 2024,
          posterUrl: null,
          fileId: 42,
          tier: 1,
        },
      });
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

      const component = fixture.componentInstance as any;
      component.applyResumePosition();

      // 3420/3600 = 0.95 → exactly at threshold → start from beginning
      expect(video.currentTime).toBe(0);
    });

    it('should NOT seek when no progress entry exists', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      // readAll returns {} by default (no entry for this title)
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

      const component = fixture.componentInstance as any;
      component.applyResumePosition();

      expect(video.currentTime).toBe(0);
    });

    it('should NOT seek when progressContext is null (no mediaType param)', () => {
      // setup with no extraQueryParams → progressContext is null
      const fixture = setup('42', '1');
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

      const component = fixture.componentInstance as any;
      component.applyResumePosition();

      expect(video.currentTime).toBe(0);
    });

    it('should NOT seek when entry.duration is 0', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      watchSvc.readAll.mockReturnValue({
        'movie:42': {
          position: 300,
          duration: 0,
          watched: false,
          updatedAt: Date.now(),
          mediaType: 'movie',
          id: 42,
          title: 'Test Movie',
          year: 2024,
          posterUrl: null,
          fileId: 42,
          tier: 1,
        },
      });
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

      const component = fixture.componentInstance as any;
      component.applyResumePosition();

      expect(video.currentTime).toBe(0);
    });

    it('should NOT seek when entry.position is 0', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      watchSvc.readAll.mockReturnValue({
        'movie:42': {
          position: 0,
          duration: 3600,
          watched: false,
          updatedAt: Date.now(),
          mediaType: 'movie',
          id: 42,
          title: 'Test Movie',
          year: 2024,
          posterUrl: null,
          fileId: 42,
          tier: 1,
        },
      });
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

      const component = fixture.componentInstance as any;
      component.applyResumePosition();

      expect(video.currentTime).toBe(0);
    });

    it('should attach loadedmetadata listener when readyState < 1', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      watchSvc.readAll.mockReturnValue({
        'movie:42': {
          position: 300,
          duration: 3600,
          watched: false,
          updatedAt: Date.now(),
          mediaType: 'movie',
          id: 42,
          title: 'Test Movie',
          year: 2024,
          posterUrl: null,
          fileId: 42,
          tier: 1,
        },
      });
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'readyState', { value: 0, configurable: true });
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

      const component = fixture.componentInstance as any;
      component.applyResumePosition();

      // currentTime not yet changed (waiting for loadedmetadata)
      expect(video.currentTime).toBe(0);

      // Fire loadedmetadata → seek should happen
      video.dispatchEvent(new Event('loadedmetadata'));
      expect(video.currentTime).toBe(300);
    });

    it('should seek immediately when readyState >= 1', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      watchSvc.readAll.mockReturnValue({
        'movie:42': {
          position: 600,
          duration: 3600,
          watched: false,
          updatedAt: Date.now(),
          mediaType: 'movie',
          id: 42,
          title: 'Test Movie',
          year: 2024,
          posterUrl: null,
          fileId: 42,
          tier: 1,
        },
      });
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

      const component = fixture.componentInstance as any;
      component.applyResumePosition();

      expect(video.currentTime).toBe(600);
    });
  });

  describe('Auto-mark as watched', () => {
    const movieQueryParams = {
      mediaType: 'movie',
      mediaId: '42',
      title: 'Test Movie',
      year: '2024',
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
    };

    const tvQueryParams = {
      mediaType: 'tv',
      mediaId: '7',
      season: '2',
      episode: '3',
      title: 'Test Show',
      year: '2022',
      posterUrl: '',
    };

    function setupVideoState(
      fixture: ReturnType<typeof setup>,
      currentTime: number,
      duration: number,
    ): HTMLVideoElement {
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', {
        value: currentTime,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(video, 'duration', {
        value: duration,
        writable: true,
        configurable: true,
      });
      return video;
    }

    it('should set watched: true when position/duration >= 0.90', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 3240, 3600); // 90%

      component.saveProgress();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'movie:42',
        expect.objectContaining({ watched: true }),
      );
    });

    it('should set watched: false when position/duration < 0.90', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 3239, 3600); // just below 90%

      component.saveProgress();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'movie:42',
        expect.objectContaining({ watched: false }),
      );
    });

    it('should mark watched: true at exactly 0.90 threshold', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 900, 1000); // exactly 0.90

      component.saveProgress();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'movie:42',
        expect.objectContaining({ watched: true }),
      );
    });

    it('should mark watched: false at 0.899', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 899, 1000); // 0.899

      component.saveProgress();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'movie:42',
        expect.objectContaining({ watched: false }),
      );
    });

    it('should set watched: true for TV episodes at 90% threshold', () => {
      const fixture = setup('99', '1', [], [], tvQueryParams as Record<string, string>);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 3240, 3600);

      component.saveProgress();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'tv:7:s2:e3',
        expect.objectContaining({ watched: true }),
      );
    });
  });

  describe('TV rewatch clearing', () => {
    const tvQueryParams = {
      mediaType: 'tv',
      mediaId: '7',
      season: '2',
      episode: '3',
      title: 'Test Show',
      year: '2022',
      posterUrl: '',
    };

    it('should clear watched status of later episodes when starting a watched TV episode', () => {
      const fixture = setup('99', '1', [], [], tvQueryParams as Record<string, string>);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;

      watchSvc.readAll.mockReturnValue({
        'tv:7:s2:e3': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 1000,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 99,
          tier: null,
          seasonNum: 2,
          episodeNum: 3,
        },
        'tv:7:s2:e4': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 2000,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 100,
          tier: null,
          seasonNum: 2,
          episodeNum: 4,
        },
        'tv:7:s3:e1': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 3000,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 101,
          tier: null,
          seasonNum: 3,
          episodeNum: 1,
        },
      });

      component.clearLaterEpisodesWatched();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'tv:7:s2:e4',
        expect.objectContaining({ watched: false }),
      );
      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'tv:7:s3:e1',
        expect.objectContaining({ watched: false }),
      );
    });

    it('should NOT clear earlier episodes watched status', () => {
      const fixture = setup('99', '1', [], [], tvQueryParams as Record<string, string>);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;

      watchSvc.readAll.mockReturnValue({
        'tv:7:s2:e2': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 500,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 98,
          tier: null,
          seasonNum: 2,
          episodeNum: 2,
        },
        'tv:7:s2:e3': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 1000,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 99,
          tier: null,
          seasonNum: 2,
          episodeNum: 3,
        },
        'tv:7:s2:e4': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 2000,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 100,
          tier: null,
          seasonNum: 2,
          episodeNum: 4,
        },
      });

      component.clearLaterEpisodesWatched();

      // Should clear e4 (later) but NOT e2 (earlier)
      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'tv:7:s2:e4',
        expect.objectContaining({ watched: false }),
      );
      expect(watchSvc.saveEntry).not.toHaveBeenCalledWith('tv:7:s2:e2', expect.anything());
    });

    it('should treat same-season higher episode number as later', () => {
      const fixture = setup('99', '1', [], [], tvQueryParams as Record<string, string>);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;

      watchSvc.readAll.mockReturnValue({
        'tv:7:s2:e3': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 1000,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 99,
          tier: null,
          seasonNum: 2,
          episodeNum: 3,
        },
        'tv:7:s2:e5': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 2000,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 102,
          tier: null,
          seasonNum: 2,
          episodeNum: 5,
        },
      });

      component.clearLaterEpisodesWatched();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'tv:7:s2:e5',
        expect.objectContaining({ watched: false }),
      );
    });

    it('should treat higher season (any episode) as later', () => {
      const fixture = setup('99', '1', [], [], tvQueryParams as Record<string, string>);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;

      watchSvc.readAll.mockReturnValue({
        'tv:7:s2:e3': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 1000,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 99,
          tier: null,
          seasonNum: 2,
          episodeNum: 3,
        },
        'tv:7:s4:e1': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 3000,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 110,
          tier: null,
          seasonNum: 4,
          episodeNum: 1,
        },
      });

      component.clearLaterEpisodesWatched();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'tv:7:s4:e1',
        expect.objectContaining({ watched: false }),
      );
    });

    it('should be a no-op when current episode is NOT already watched', () => {
      const fixture = setup('99', '1', [], [], tvQueryParams as Record<string, string>);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;

      watchSvc.readAll.mockReturnValue({
        'tv:7:s2:e3': {
          position: 1000,
          duration: 3600,
          watched: false,
          updatedAt: 1000,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 99,
          tier: null,
          seasonNum: 2,
          episodeNum: 3,
        },
        'tv:7:s2:e4': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 2000,
          mediaType: 'tv',
          id: 7,
          title: 'Test Show',
          posterUrl: null,
          year: 2022,
          fileId: 100,
          tier: null,
          seasonNum: 2,
          episodeNum: 4,
        },
      });

      component.clearLaterEpisodesWatched();

      expect(watchSvc.saveEntry).not.toHaveBeenCalled();
    });

    it('should be a no-op for movies', () => {
      const movieParams = {
        mediaType: 'movie',
        mediaId: '42',
        title: 'Test Movie',
        year: '2024',
        posterUrl: '',
      };
      const fixture = setup('42', '1', [], [], movieParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;

      watchSvc.readAll.mockReturnValue({
        'movie:42': {
          position: 3400,
          duration: 3600,
          watched: true,
          updatedAt: 1000,
          mediaType: 'movie',
          id: 42,
          title: 'Test Movie',
          posterUrl: null,
          year: 2024,
          fileId: 42,
          tier: null,
        },
      });

      component.clearLaterEpisodesWatched();

      expect(watchSvc.saveEntry).not.toHaveBeenCalled();
    });

    it('should be a no-op when progressContext is null', () => {
      const fixture = setup('42', '1'); // no query params → null progressContext
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;

      component.clearLaterEpisodesWatched();

      expect(watchSvc.saveEntry).not.toHaveBeenCalled();
    });
  });

  describe('Track preference persistence', () => {
    const movieQueryParams = {
      mediaType: 'movie',
      mediaId: '42',
      title: 'Test Movie',
      year: '2024',
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
    };

    function setupVideoState(
      fixture: ReturnType<typeof setup>,
      currentTime: number,
      duration: number,
    ): HTMLVideoElement {
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', {
        value: currentTime,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(video, 'duration', {
        value: duration,
        writable: true,
        configurable: true,
      });
      return video;
    }

    it('should include audioTrackIndex in saved progress entry', () => {
      const audioTracks = [
        { index: 0, language: 'eng', codec: 'aac', channels: 2 },
        { index: 1, language: 'fra', codec: 'aac', channels: 2 },
      ];
      const fixture = setup('42', '1', [], audioTracks, movieQueryParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 120, 3600);

      // Simulate user selecting audio track index 1
      component.activeAudioIndex.set(1);
      component.saveProgress();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'movie:42',
        expect.objectContaining({ audioTrackIndex: 1 }),
      );
    });

    it('should include subtitleTrackId in saved progress entry', () => {
      const subtitleTracks = [
        { id: 5, language: 'eng' },
        { id: 6, language: 'fra' },
      ];
      const fixture = setup('42', '1', subtitleTracks, [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 120, 3600);

      // Simulate user selecting subtitle track 5
      component.activeSubtitleId.set(5);
      component.saveProgress();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'movie:42',
        expect.objectContaining({ subtitleTrackId: 5 }),
      );
    });

    it('should save undefined for track fields when no track is selected', () => {
      const fixture = setup('42', '1', [], [], movieQueryParams);
      const component = fixture.componentInstance as any;
      const watchSvc = TestBed.inject(WatchProgressService) as any;
      setupVideoState(fixture, 120, 3600);

      component.activeAudioIndex.set(null);
      component.activeSubtitleId.set(null);
      component.saveProgress();

      expect(watchSvc.saveEntry).toHaveBeenCalledWith(
        'movie:42',
        expect.objectContaining({ audioTrackIndex: undefined, subtitleTrackId: undefined }),
      );
    });

    it('should restore saved audio track on init when track exists', async () => {
      const audioTracks = [
        { index: 0, language: 'eng', codec: 'aac', channels: 2 },
        { index: 1, language: 'fra', codec: 'aac', channels: 2 },
      ];
      const watchProgressMock = {
        saveEntry: vi.fn(),
        readAll: vi.fn().mockReturnValue({
          'movie:42': {
            position: 120,
            duration: 3600,
            watched: false,
            updatedAt: Date.now(),
            mediaType: 'movie',
            id: 42,
            title: 'Test Movie',
            year: 2024,
            posterUrl: null,
            fileId: 42,
            tier: 1,
            audioTrackIndex: 1,
          },
        }),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [PlayerComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: makeActivatedRouteStub('42', '1', movieQueryParams),
          },
          { provide: Location, useValue: { back: vi.fn() } },
          { provide: WatchProgressService, useValue: watchProgressMock },
        ],
      });

      httpTesting = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(PlayerComponent);
      fixture.detectChanges();

      httpTesting.expectOne('/api/media/42/subtitles').flush([]);
      httpTesting.expectOne('/api/media/42/audio-tracks').flush(audioTracks);
      fixture.detectChanges();

      // Wait for setTimeout in restoreAudioPreference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const component = fixture.componentInstance;
      expect(component.activeAudioIndex()).toBe(1);
      httpTesting.verify();
    });

    it('should restore saved subtitle track on init when track exists', async () => {
      const subtitleTracks = [
        { id: 5, language: 'eng' },
        { id: 6, language: 'fra' },
      ];
      const watchProgressMock = {
        saveEntry: vi.fn(),
        readAll: vi.fn().mockReturnValue({
          'movie:42': {
            position: 120,
            duration: 3600,
            watched: false,
            updatedAt: Date.now(),
            mediaType: 'movie',
            id: 42,
            title: 'Test Movie',
            year: 2024,
            posterUrl: null,
            fileId: 42,
            tier: 1,
            subtitleTrackId: 6,
          },
        }),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [PlayerComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: makeActivatedRouteStub('42', '1', movieQueryParams),
          },
          { provide: Location, useValue: { back: vi.fn() } },
          { provide: WatchProgressService, useValue: watchProgressMock },
        ],
      });

      httpTesting = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(PlayerComponent);
      fixture.detectChanges();

      httpTesting.expectOne('/api/media/42/subtitles').flush(subtitleTracks);
      httpTesting.expectOne('/api/media/42/audio-tracks').flush([]);
      fixture.detectChanges();

      // Wait for setTimeout in restoreSubtitlePreference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const component = fixture.componentInstance;
      expect(component.activeSubtitleId()).toBe(6);
      httpTesting.verify();
    });

    it('should fall back to default when saved audio track no longer exists', () => {
      const audioTracks = [
        { index: 0, language: 'eng', codec: 'aac', channels: 2 },
        { index: 1, language: 'fra', codec: 'aac', channels: 2 },
      ];
      const watchProgressMock = {
        saveEntry: vi.fn(),
        readAll: vi.fn().mockReturnValue({
          'movie:42': {
            position: 120,
            duration: 3600,
            watched: false,
            updatedAt: Date.now(),
            mediaType: 'movie',
            id: 42,
            title: 'Test Movie',
            year: 2024,
            posterUrl: null,
            fileId: 42,
            tier: 1,
            audioTrackIndex: 99, // Does not exist
          },
        }),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [PlayerComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: makeActivatedRouteStub('42', '1', movieQueryParams),
          },
          { provide: Location, useValue: { back: vi.fn() } },
          { provide: WatchProgressService, useValue: watchProgressMock },
        ],
      });

      httpTesting = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(PlayerComponent);
      fixture.detectChanges();

      httpTesting.expectOne('/api/media/42/subtitles').flush([]);
      httpTesting.expectOne('/api/media/42/audio-tracks').flush(audioTracks);
      fixture.detectChanges();

      // Falls back to first track (index 0)
      const component = fixture.componentInstance;
      expect(component.activeAudioIndex()).toBe(0);
      httpTesting.verify();
    });

    it('should fall back to null when saved subtitle track no longer exists', () => {
      const subtitleTracks = [
        { id: 5, language: 'eng' },
        { id: 6, language: 'fra' },
      ];
      const watchProgressMock = {
        saveEntry: vi.fn(),
        readAll: vi.fn().mockReturnValue({
          'movie:42': {
            position: 120,
            duration: 3600,
            watched: false,
            updatedAt: Date.now(),
            mediaType: 'movie',
            id: 42,
            title: 'Test Movie',
            year: 2024,
            posterUrl: null,
            fileId: 42,
            tier: 1,
            subtitleTrackId: 99, // Does not exist
          },
        }),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [PlayerComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: makeActivatedRouteStub('42', '1', movieQueryParams),
          },
          { provide: Location, useValue: { back: vi.fn() } },
          { provide: WatchProgressService, useValue: watchProgressMock },
        ],
      });

      httpTesting = TestBed.inject(HttpTestingController);
      const fixture = TestBed.createComponent(PlayerComponent);
      fixture.detectChanges();

      httpTesting.expectOne('/api/media/42/subtitles').flush(subtitleTracks);
      httpTesting.expectOne('/api/media/42/audio-tracks').flush([]);
      fixture.detectChanges();

      // Falls back to null (off)
      const component = fixture.componentInstance;
      expect(component.activeSubtitleId()).toBeNull();
      httpTesting.verify();
    });
  });
});
