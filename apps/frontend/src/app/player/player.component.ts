import {
  Component,
  ChangeDetectionStrategy,
  inject,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';

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
  readonly fileId = this.route.snapshot.paramMap.get('fileId');
  readonly isTier2 = this.route.snapshot.queryParamMap.get('tier') === '2';

  readonly videoSrc = `/api/media/stream/${this.fileId}`;
  readonly audioSrc = `/api/media/stream/${this.fileId}/audio`;

  @ViewChild('videoEl') videoElRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('audioEl') audioElRef!: ElementRef<HTMLAudioElement>;

  private rafId: number | null = null;
  private videoReady = false;
  private audioReady = false;
  private isMirroring = false;
  private syncDisabled = false;
  private listeners: Array<[HTMLElement, string, EventListener]> = [];

  ngAfterViewInit(): void {
    if (!this.isTier2) return;

    const video = this.videoElRef.nativeElement;
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
  }

  ngOnDestroy(): void {
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
    if (this.videoReady && this.audioReady) {
      const video = this.videoElRef.nativeElement;
      const audio = this.audioElRef.nativeElement;
      audio.currentTime = video.currentTime;
      audio.play().catch(() => {});
      this.syncLoop();
    }
  }

  private syncLoop(): void {
    const video = this.videoElRef?.nativeElement;
    const audio = this.audioElRef?.nativeElement;
    if (!video || !audio) return;

    const drift = Math.abs(video.currentTime - audio.currentTime);
    if (drift > 0.05) {
      audio.currentTime = video.currentTime;
    }
    this.rafId = requestAnimationFrame(() => this.syncLoop());
  }

  private cancelSync(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
