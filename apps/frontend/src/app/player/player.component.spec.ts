import { TestBed } from '@angular/core/testing';
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

  function setup(fileId = '42', tier?: string) {
    mockLocation = { back: vi.fn() };

    TestBed.configureTestingModule({
      imports: [PlayerComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: makeActivatedRouteStub(fileId, tier) },
        { provide: Location, useValue: mockLocation },
      ],
    });

    const fixture = TestBed.createComponent(PlayerComponent);
    fixture.detectChanges();
    return fixture;
  }

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

  describe('Sync loop drift correction', () => {
    it('should correct audio when drift exceeds 50ms', () => {
      const fixture = setup('99', '2');
      const component = fixture.componentInstance as any;
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;

      // Simulate times
      Object.defineProperty(video, 'currentTime', { value: 10.0, writable: true });
      Object.defineProperty(audio, 'currentTime', { value: 9.9, writable: true });

      // Drift = 0.1s > 0.05s threshold
      // Access private syncLoop via the component
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
      component.videoReady = true;
      component.audioReady = true;
      component.syncLoop();
      rafSpy.mockRestore();

      // audio.currentTime should have been set to video.currentTime
      expect(audio.currentTime).toBe(10.0);
    });

    it('should NOT correct audio when drift is within 50ms', () => {
      const fixture = setup('99', '2');
      const component = fixture.componentInstance as any;
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;

      Object.defineProperty(video, 'currentTime', { value: 10.0, writable: true });
      Object.defineProperty(audio, 'currentTime', { value: 9.97, writable: true });

      // Drift = 0.03s < 0.05s threshold
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
      component.syncLoop();
      rafSpy.mockRestore();

      // audio.currentTime should NOT have been changed
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
