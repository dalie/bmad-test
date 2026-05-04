import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PlayerComponent } from './player.component';

function makeActivatedRouteStub(fileId: string) {
  const paramMap = convertToParamMap({ fileId });
  return {
    snapshot: { paramMap },
    paramMap: of(paramMap),
  };
}

describe('PlayerComponent', () => {
  let mockLocation: Pick<Location, 'back'>;

  beforeEach(async () => {
    mockLocation = { back: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [PlayerComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: makeActivatedRouteStub('42') },
        { provide: Location, useValue: mockLocation },
      ],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(PlayerComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should read fileId from route params', () => {
    const fixture = TestBed.createComponent(PlayerComponent);
    const component = fixture.componentInstance;
    expect(component.fileId).toBe('42');
  });

  it('should set video src to streaming endpoint with fileId', () => {
    const fixture = TestBed.createComponent(PlayerComponent);
    fixture.detectChanges();
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe('/api/media/stream/42');
  });

  it('should have autoplay attribute on video element', () => {
    const fixture = TestBed.createComponent(PlayerComponent);
    fixture.detectChanges();
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    expect(video.hasAttribute('autoplay')).toBe(true);
  });

  it('should have controls attribute on video element', () => {
    const fixture = TestBed.createComponent(PlayerComponent);
    fixture.detectChanges();
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    expect(video.hasAttribute('controls')).toBe(true);
  });

  it('should have preload="auto" on video element', () => {
    const fixture = TestBed.createComponent(PlayerComponent);
    fixture.detectChanges();
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('preload')).toBe('auto');
  });

  it('should have a back button', () => {
    const fixture = TestBed.createComponent(PlayerComponent);
    fixture.detectChanges();
    const backBtn = fixture.nativeElement.querySelector('.back-link') as HTMLButtonElement;
    expect(backBtn).toBeTruthy();
  });

  it('should call location.back() when back button is clicked', () => {
    const fixture = TestBed.createComponent(PlayerComponent);
    fixture.detectChanges();
    const backBtn = fixture.nativeElement.querySelector('.back-link') as HTMLButtonElement;
    backBtn.click();
    expect(mockLocation.back).toHaveBeenCalled();
  });
});
