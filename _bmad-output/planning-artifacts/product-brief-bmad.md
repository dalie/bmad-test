---
title: "Product Brief: Cineplex Rigaud"
status: "complete"
created: "2026-04-28"
updated: "2026-04-28"
inputs: [user conversation, TMDB API documentation, Plex/Jellyfin/Emby competitive research]
---

# Product Brief: Cineplex Rigaud

## Executive Summary

Cineplex Rigaud is a self-hosted media server that serves your existing video library directly to the browser with minimal processing. Most files play as-is — only incompatible audio tracks get transcoded into small sidecar files. The result: instant playback, instant seeking, and near-zero storage overhead — all without touching your source files.

Every existing self-hosted media server (Plex, Jellyfin, Emby) transcodes on-the-fly when someone hits play, creating CPU spikes, seek latency, and hardware requirements that push hobbyists toward expensive server builds. Cineplex Rigaud does the opposite — handle the small amount of necessary processing at import time, then serve static files forever. The server's job at play time is nothing more than responding to HTTP range requests.

The viewing UI is built for non-technical family and friends — clean, fast, requiring zero setup or accounts. Watch progress and preferences live in the browser's localStorage. No auth, no profiles, no server state.

## The Problem

Self-hosted media servers today force a tradeoff: **capability vs. simplicity**. Plex is powerful but paywalled, cloud-dependent, and bloated with streaming ads and podcasts. Jellyfin is free but demands significant setup effort and still hammers your server CPU every time someone hits play. Both share a core weakness — deferring transcoding to playback time, creating:

- **Seek latency of 1-5 seconds** as the server re-starts the transcode pipeline
- **CPU saturation** when multiple family members watch simultaneously
- **High hardware requirements** — a single 1080p transcode needs ~2000 PassMark score
- **Buffering storms** on remote or slow connections

Meanwhile, the person setting all this up just wants their family to watch movies without calling them for tech support.

## The Solution

Point Cineplex Rigaud at a folder of movies and TV shows. It scans for video files, matches them to TMDB for rich metadata (posters, descriptions, episode info), and intelligently prepares them for web playback — touching only what's necessary.

**The smart transcode pipeline:**

1. **H.264/H.265 video + AAC audio** → serve the original file directly. Zero processing.
2. **H.264/H.265 video + incompatible audio (AC3, DTS, TrueHD, etc.)** → extract and transcode audio only into a small AAC sidecar file (~100-200MB). Serve original video + synced sidecar audio. Source file untouched.
3. **Non-web-compatible video codec** → full transcode to MP4 with faststart. Rare case.

Source files are never modified — critical for users whose libraries are actively seeding torrents. At play time, the server does nothing but respond to HTTP range requests. The web frontend handles synced playback of video + audio sidecar when needed, with a clean, family-friendly browsing interface.

## What Makes This Different

| | Plex / Jellyfin / Emby | Cineplex Rigaud |
|---|---|---|
| Server CPU at play time | High (real-time transcode) | **Near-zero** (static file serving) |
| Seek latency | 1-5s | **Instant** (HTTP range requests) |
| Multi-viewer scaling | Degrades per viewer | **Linear** (independent static reads) |
| Storage overhead | N/A (source only) | **~2-3%** (audio sidecars only, most cases) |
| Source files | Copied/managed by server | **Never touched** |
| Minimum hardware | Powerful CPU or GPU | **Anything** — even a Pi |
| Auth / accounts | Required | **None** |
| Feature scope | Everything (music, live TV, podcasts, ads) | **Video only — focused** |

The core bet: **serve originals directly, process only what browsers can't handle, and never touch source files.**

## Who This Serves

**Admin (setup):** A technically-minded homelabber who owns a media library (often torrented) and wants to share it with family. Comfortable with CLI, Docker, port forwarding. Frustrated by Plex's paywalls, Jellyfin's CPU spikes, or both.

**Viewers (daily use):** Non-technical family and friends who want to open a browser, pick a movie, and watch. No accounts, no apps to install, no configuration. Playback should feel instant and obvious.

## Success Criteria

- Browse and play any title with instant playback start and instant seek
- Watch progress persists per device across sessions
- Viewing UI is usable by non-technical family without guidance
- Server runs comfortably on modest hardware during playback
- Source files remain completely untouched

## Scope

**V1 includes:**

- Folder watching and video file detection
- TMDB metadata matching (movies and TV shows)
- Smart transcode pipeline: serve originals when possible, audio-only sidecar transcode when needed, full transcode as last resort
- Synced playback of original video + AAC audio sidecar in the browser
- Subtitle extraction (embedded tracks and sidecar files) served as WebVTT
- Web UI: browse library, play video, track watch progress via localStorage
- Backend API: scan, metadata, transcode orchestration, media serving via HTTP range requests

**V1 excludes:**

- Music, live TV, podcasts
- Multi-rendition / adaptive bitrate
- Server-side user accounts, auth, profiles
- Mobile native apps
- Remote access infrastructure (handled at router/network level)
- On-the-fly transcoding
- Modification of source files

## Vision

If Cineplex Rigaud succeeds, it becomes the go-to media server for people who value **performance and simplicity over features**. Future directions could include adaptive multi-rendition support, smart collections, richer metadata, and community-contributed UI themes. But the core promise never changes: serve your files as they are, process only what's necessary, never touch the originals.
