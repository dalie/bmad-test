import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PlayerComponent } from './player.component';

function makeActivatedRouteStub(fileId: string, tier?: string) {
  const paramMap = convertToParamMap({ fileId });
  const queryParamMap = convertToParamMap(tier ? { tier } : {});
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
  ) {
    mockLocation = { back: vi.fn() };

    TestBed.configureTestingModule({
      imports: [PlayerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: makeActivatedRouteStub(fileId, tier) },
        { provide: Location, useValue: mockLocation },
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PlayerComponent);
    fixture.detectChanges();

    // Respond to subtitle fetch
    const req = httpTesting.expectOne(`/api/media/${fileId}/subtitles`);
    req.flush(subtitleTracks);
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

      // No HTTP request should have been made (fileId is empty string which is falsy)
      httpTesting.expectNone((req) => req.url.includes('/subtitles'));
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
});
