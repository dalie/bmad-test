---
title: 'UI: Admin link home-only and player controls auto-hide'
type: 'bugfix'
created: '2026-05-05'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** The admin link was visible on all pages (rendered in the app shell), and the video player's overlay controls (back button, subtitle selector, audio selector) were permanently visible, cluttering the viewing experience.

**Approach:** Move the admin nav into the HomeComponent so it only renders on the home page. Add a 3-second mouse/touch inactivity auto-hide to the player's overlay controls with a CSS opacity transition.

## Suggested Review Order

1. [player.component.ts](player.component.ts) — core auto-hide logic: `controlsVisible` signal, `onMouseActivity()` HostListener, menu-open guard, cleanup in `ngOnDestroy`
2. [player.component.html](player.component.html) — `[class.controls-hidden]` bindings on back-link, subtitle-controls, audio-controls
3. [player.component.css](player.component.css) — transition + `.controls-hidden` opacity/pointer-events rule
4. [app.ts](app.ts) — stripped admin service and RouterLink (shell no longer needs them)
5. [app.html](app.html) — reduced to bare `<router-outlet />`
6. [home.component.ts](home.component.ts) — added AdminAccessService inject and `isAdmin` signal
7. [home.component.html](home.component.html) — admin nav `@if` block prepended before `<main>`
8. [home.component.css](home.component.css) — `.admin-nav` styling
