---
title: "Product Brief Distillate: Cineplex Rigaud"
type: llm-distillate
source: "product-brief-bmad.md"
created: "2026-04-28"
purpose: "Token-efficient context for downstream PRD creation"
---

# Product Brief Distillate: Cineplex Rigaud

## Rejected Approaches (do not re-propose)

- **HLS segmented streaming** — User tested MP4 with HTTP range requests and confirmed it meets performance requirements for instant play + instant seek. HLS adds playlist/segment complexity for no benefit in this use case.
- **Full file remux/duplication** — Source files are torrented and must stay untouched for seeding. Remuxing duplicates ~95% of file size for marginal benefit. Audio-only sidecar approach chosen instead (~2-3% overhead).
- **Multi-rendition / adaptive bitrate** — Single rendition at original quality. User explicitly chose simplicity + storage savings over bandwidth adaptation.
- **MediaSource Extensions for audio sync** — MSE SourceBuffer approach is more complex than dual HTML element sync (`<video muted>` + `<audio>`) for comparable results. Dual-element approach chosen.
- **Server-side user state / auth / profiles** — All personalization via browser localStorage. Each device = its own profile. No database of user preferences.
- **On-the-fly transcoding** — Entire architecture is built around zero server compute at play time.
- **Music support** — Explicitly out of scope. Video only (movies + TV shows).
- **Mobile native apps** — Web-only for v1.

## Requirements Hints

- **Tiered transcode pipeline** (critical path):
  - Tier 1: H.264/H.265 + AAC → serve original, zero processing
  - Tier 2: H.264/H.265 + AC3/DTS/TrueHD → extract audio, transcode to AAC sidecar (~100-200MB), serve original video + sidecar audio
  - Tier 3: Non-web video codec → full transcode to MP4 with `-movflags +faststart` (rare case)
- **Source files are NEVER modified** — read-only access. Active torrent seeding use case.
- **Dual-element synced playback** — `<video src="movie.mkv" muted>` + `<audio src="movie.aac">`, synced via JS. Needs `requestAnimationFrame` sync loop correcting drift beyond ~50ms threshold.
- **Filename parsing for TMDB matching** — Must handle patterns like `Movie.2019.1080p.BluRay.x264-GROUP.mkv` and `ShowName.S01E02.mkv`. Regex extraction of title, year, season, episode before TMDB search.
- **TMDB matching strategy** — Search by extracted title + year, compare results. Use `/find/{imdb_id}` for precision when IMDb IDs available. Fall back to manual matching for ambiguous cases.
- **MP4 faststart** — For Tier 3 full transcodes, moov atom must be at file start (`-movflags +faststart`) for instant playback via range requests.
- **Regular keyframe intervals** — For clean seeking in both original files and transcoded output.
- **Subtitle handling** — Detect embedded subtitle tracks and sidecar files (.srt, .ass, etc.), extract/convert to WebVTT, serve alongside video.
- **Watch progress in localStorage** — Per-device, per-browser. Lost on browser data clear. Accepted tradeoff.

## Technical Context

- **MKV browser compatibility** — Chrome and Firefox play MKV natively (H.264 and H.265) because Matroska/WebM share container lineage. The container is NOT the problem.
- **Audio is the real browser blocker** — AC3, DTS, DTS-HD, TrueHD are not decoded by any browser. AAC-LC is universally supported.
- **H.265 browser support** — Partial. Chrome/Edge need hardware decoder + OS support. Firefox recent (137+), Windows-only, hardware required. Safari full support. H.264 is the safe universal codec. H.265 works but needs testing across target browsers.
- **FFmpeg audio-only transcode** — `ffmpeg -i input.mkv -vn -c:a aac -b:a 192k output.aac` for sidecar extraction. Fast (seconds to minutes per title).
- **FFmpeg full transcode** — `ffmpeg -i input.mkv -c:v libx264 -crf 18 -preset slow -c:a aac -movflags +faststart output.mp4` for Tier 3.
- **HTTP range requests** — Standard mechanism. Any HTTP server supports them. Browser calculates byte offset for timestamp, fetches exactly those bytes. No server logic needed.
- **TMDB API** — Free for non-commercial use. Bearer token auth preferred. Rate limit ~40 req/s (effectively unlimited for library scanning). Image base URL must be fetched from `GET /3/configuration` endpoint (can change, cache but refresh). `append_to_response` parameter batches sub-requests.
- **TMDB hierarchical TV structure** — Show → Seasons → Episodes requires multiple API calls. Use `append_to_response` to batch.

## Competitive Intelligence

- **Plex** — On-the-fly transcode, ~2000 PassMark per 1080p stream, Plex Pass paywall ($120/yr or $250 lifetime) for hardware transcoding, cloud account dependency (LAN playback affected by Plex outages), aggressive feature creep (ads, podcasts, news mixed into UI), seeking causes re-transcode storms
- **Jellyfin** — Fork of Emby, free/OSS, same on-the-fly transcode model, hardware acceleration requires manual config, UI polish inconsistent (volunteer-driven), metadata matching fails on unusual filenames
- **Emby** — Closed-source pivot in 2018 spawned Jellyfin, paid Premiere tier, less community momentum
- **None offer pre-processing or zero-runtime-compute architecture** — This is Cineplex Rigaud's core differentiator

## User Scenarios

- **Admin persona** — Technical homelabber, comfortable with CLI/Docker/networking, owns torrented media library (100-500 titles), frustrated by Plex paywalls and Jellyfin CPU spikes, wants to share library with family
- **Viewer persona** — Non-technical family and friends, expects Netflix-like instant playback, no account creation or app installs, opens browser and watches
- **Library profile** — Medium size (100-500 titles), primarily MKV files from torrents, H.264/H.265 video, mixed audio codecs (many AC3/DTS), actively seeding
- **Multi-viewer scenario** — Multiple family members watching different titles simultaneously. Zero server CPU impact since all playback is static file serving.

## Open Questions

- **Audio sync drift tolerance** — Dual-element sync approach needs early prototyping to validate. What's the acceptable drift threshold? Is 50ms correction sufficient, or does seek/pause/resume introduce larger gaps?
- **H.265 browser test matrix** — Need to validate H.265 playback across Chrome, Firefox, Edge, Safari on actual target devices before committing to "serve as-is" for H.265 content
- **Filename parsing robustness** — Common torrent naming conventions vary widely. What fallback strategies? Manual TMDB matching UI? Folder-based conventions? NFO file parsing?
- **Subtitle format coverage** — Which subtitle formats need conversion to WebVTT? SRT is straightforward. ASS/SSA styling is lost in conversion. PGS (bitmap) subtitles cannot be converted to WebVTT without OCR.
- **Folder watching strategy** — Polling vs. filesystem events (inotify/FSEvents)? How to handle in-progress downloads (partially written files)?
- **Sidecar file organization** — Where do AAC sidecar files and WebVTT subtitles live? Adjacent to source? In a managed cache directory?

## Scope Signals

- **In for V1**: folder scan, TMDB matching, smart transcode pipeline, synced playback, subtitle extraction as WebVTT, web UI with localStorage state, backend API with range request serving
- **Out for V1**: music, live TV, podcasts, multi-rendition, server-side auth/profiles, mobile native apps, remote access infra, on-the-fly transcoding, source file modification
- **User skill level**: intermediate (per config)
- **Codename**: Cineplex Rigaud (may change)
