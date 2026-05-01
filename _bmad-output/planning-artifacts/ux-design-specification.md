---
stepsCompleted:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
inputDocuments:
  - prd.md
  - product-brief-bmad.md
  - product-brief-bmad-distillate.md
  - architecture.md
  - implementation-readiness-report-2026-04-30.md
---

# UX Design Specification — Cineplex Rigaud

**Author:** Dude
**Date:** 2026-04-30

---

## Executive Summary

### Project Vision

Cineplex Rigaud is a self-hosted media server that inverts the standard architecture: all processing happens at import time, and playback is pure static file serving. The UX must make this architectural advantage *felt* — every interaction should be instant, obvious, and frictionless.

Three UX principles define the product:
1. **The poster grid is the entire navigation.** No menus, no sidebars, no hamburger icons for viewers. Three sections in fixed order: Continue Watching → Recently Added → Full Library A-Z. Browsing the grid *is* using the product.
2. **Pages, not overlays.** Clicking a poster navigates to a detail page with info and a Play button. Back button returns to the grid. Standard web navigation — links, pages, URLs. No modals, no overlays, no inline expansion.
3. **Honest speed.** No skeleton screens, no shimmer effects, no loading animations. The page is fast because it's simple HTML and CSS served statically. Speed comes from actual simplicity, not perceived-speed tricks layered over complexity.

The viewer-facing surface targets non-technical family members who should never need instructions. The admin surface serves a technical homelabber who needs pipeline visibility without polish overhead.

### Target Users

**Primary: Viewer (Marie archetype)** — Non-technical, potentially elderly, using tablet or phone. Opens a bookmark, sees a wall of posters, taps one, reads the description, taps Play. No accounts, no menus to find, no learning curve. Resume works across sessions. This is the product's true user — if Marie can't use it unaided, the UX has failed.

**Primary: Viewer (Marc archetype)** — Tech-comfortable cinephile on desktop. Needs subtitle selection, expects foreign films to work seamlessly. Notices and appreciates the speed. Will explore the full library through the poster grid and search.

**Secondary: Admin (Dude)** — The developer/homelabber. Deploys via Docker, monitors import pipeline, resolves TMDB matching failures. Admin surfaces as a contextual overlay when on LAN — not a separate mode to switch into.

**Future: Child Viewer (Sophie archetype)** — Post-MVP. Age-filtered profile, separate watch progress. UI looks like a smaller, kid-friendly library — no indication that content is being filtered.

### Key Design Challenges

1. **Zero-guidance usability** — The viewer UI is a poster grid with three predictable sections (Continue Watching, Recently Added, A-Z). No menus means zero navigational concepts for Marie to learn. The fixed alphabetical ordering means she always knows where a title is.
2. **Invisible technical complexity** — Dual-element audio sync, tiered transcode handling, and subtitle extraction pipelines must be completely transparent to viewers. No error states, no codec warnings, no "unsupported format" messages.
3. **Admin/Viewer boundary** — LAN-only admin visibility as a separate admin page/route. Viewers never see admin elements or links.
4. **TV show navigation depth** — Show → Season → Episode requires hierarchical browsing via standard page navigation (grid → show page → season → episode). Must stay intuitive using normal web patterns (links, back button).
5. **Responsive across devices** — iPad (Marie), desktop (Marc), phone (casual browsing). Poster sizes adapt — larger and fewer on mobile for legibility, denser on desktop. The same grid layout works everywhere. Nothing shifts on hover or load.

### Design Opportunities

1. **Honest speed as emotional signature** — No loading tricks. The page is fast because it's simple. Static HTML, clean CSS, pre-sized image slots, lazy-loaded posters. The entire experience feels impossibly fast because it *is* fast — not because we're masking slowness.
2. **Watch progress as personalization** — "Continue Watching" row at the top of the grid, progress bars on poster edges. localStorage state creates a personalized experience without profiles, accounts, or server state.
3. **Two-click playback** — Click poster → detail page → click Play. Standard web navigation that works with back button, bookmarks, and browser history. Fewer concepts = fewer failure modes = fewer calls to Dude.
4. **Visual simplicity as differentiator** — Competitors are cluttered with menus, settings, animations, and feature chrome. Clean semantic HTML with good CSS spacing — like a well-designed library catalog — stands out by being calm and predictable.

## Core User Experience

### Defining Experience

The core experience is a **two-click flow**: see a poster, click it (detail page), click Play. Everything else in the viewer UI exists to support or enhance this flow. The product's value is delivered the instant video starts playing — and that instant is *literally instant* because the server does zero processing at play time.

The secondary loop is **ambient resume**: return to the app, see your progress at the top ("Continue Watching" row), click, resume where you left off. This requires zero user action to set up — it happens automatically through localStorage persistence.

### Platform Strategy

- **Platform:** Web SPA (Angular + Signals), served from the same Docker container as the backend
- **Primary device:** Tablet (iPad — Marie's device). Design poster sizes, tap targets, and layout for touch-first at tablet resolution, then adapt down to phone and up to desktop
- **Input modes:** Touch (primary), mouse (desktop), keyboard (search/power users)
- **Offline:** Not supported — streaming from LAN server requires connectivity
- **Responsive approach:** Same grid-first layout at all breakpoints. Posters get larger/fewer on smaller screens, denser on larger screens. No layout paradigm shift between devices

### Effortless Interactions

| Interaction | What makes it effortless |
|---|---|
| **Browsing** | Poster grid is the only screen. Three fixed sections: Continue Watching → Recently Added → A-Z. Scroll to explore. Predictable ordering means you always know where a title is. |
| **Playing** | Click poster → detail page → click Play. Two clicks. Instant start. No buffering indicator ever appears. |
| **Resuming** | "Continue Watching" row at the top. Progress bars visible on poster edges. Click to resume — no "where was I?" friction. |
| **Discovering new content** | "Recently Added" row surfaces new titles without admin announcing them. Fixed position — always the second row. |
| **Subtitles** | Controls within the video player during playback. Standard HTML5 video controls pattern. |
| **Admin awareness** | Separate admin route, visible only on LAN. Dude navigates there when needed. |

### Critical Success Moments

1. **The First Play** — Marie taps a poster, taps Play, and video starts in under 1 second. No loading, no buffering, no spinner. This is the moment that proves the architecture works and the product delivers on its promise. If this fails, nothing else matters.
2. **The Return Visit** — Marie opens the bookmark the next day. Her movie is right there at the top with a progress bar. She taps, resumes instantly. The product "remembers" her without accounts or setup.
3. **The Silent Library Growth** — Dude adds new movies to the folder. They appear in the library automatically. His family discovers them organically. Nobody was notified, nothing was configured — it just works.
4. **The Invisible Complexity** — Marc plays a Japanese film with DTS audio. The dual-element sync kicks in transparently. He selects English subtitles from an overlay. At no point does he know or care that audio is being served from a sidecar file.

### Experience Principles

1. **Two clicks to value.** Every viewer goal — play, resume, discover — must be achievable in two clicks or fewer from the poster grid.
2. **Speed is honesty.** The page is fast because it's simple — not because we're hiding slowness behind animations. No skeleton screens, no shimmer, no loading tricks.
3. **The grid is the app.** No navigation, no menus, no modes for viewers. The poster grid with three fixed sections (Continue Watching, Recently Added, A-Z) is the entire product surface.
4. **Complexity is invisible.** Transcoding tiers, audio sync, subtitle extraction, TMDB matching — none of this surfaces to viewers. The system handles it or the admin handles it. Viewers just watch.
5. **Nothing moves unless you click it.** No hover effects, no auto-expand, no autoplay previews, no layout shifts. The page is static until the user explicitly navigates.

## Desired Emotional Response

### Primary Emotional Goals

| Emotion | When it should hit | Why it matters |
|---|---|---|
| **Effortlessness** | Browsing and playing | Marie should never feel like she's "using software." It should feel like flipping through a bookshelf and pulling out a movie. Zero cognitive load. |
| **Speed as magic** | Every tap, every interaction | The instant response to every action creates a visceral feeling that something is different here. Competitors trained users to expect waiting. The absence of waiting feels like magic. |
| **Confidence** | First visit and every return | Marie should feel certain about what to do next at every moment. No hesitation, no "did I break something?", no dead ends. |
| **Ownership** | Seeing watch progress, personal rows | "This is *my* library." The personalization from localStorage makes it feel like the app knows you — without creepy tracking or account setup. |

### Emotional Journey Mapping

| Stage | Marie feels... | Marc feels... | Dude feels... |
|---|---|---|---|
| **First open** | "Oh, this looks nice. I can see the movies." (Familiarity, comfort) | "Clean. Fast. No clutter." (Appreciation, respect) | "It works. Library is scanning." (Relief, satisfaction) |
| **First play** | "It just started! No waiting!" (Surprise, delight) | "Wow, that was instant." (Impressed) | "The architecture delivers." (Validation) |
| **During playback** | "I'm watching my movie." (Contentment, immersion) | "Subtitles work perfectly." (Satisfaction) | N/A |
| **Return visit** | "There's my movie, right where I left it." (Trust, recognition) | "New stuff appeared. Nice." (Discovery) | "No issues in the queue." (Calm) |
| **Something goes wrong** | *She never sees it.* System handles it or admin handles it. | Notices nothing — transparent recovery. | Clear error in admin panel with actionable resolution. (Control, not panic) |

### Micro-Emotions

**Cultivate:**
- **Trust** — The app always works the same way. No surprises, no mode changes, no "update required" interruptions.
- **Recognition** — "Continue Watching" and progress bars say "welcome back" without words.
- **Calm** — No notifications, no badges, no urgency. The library is always there, always ready.

**Eliminate:**
- **Confusion** — No menus to find, no settings to configure, no "where did it go?"
- **Anxiety** — No error messages visible to viewers. No "something went wrong" screens. No codec warnings.
- **Impatience** — No spinners, no progress bars, no "loading." If the user ever waits, we've failed.
- **Self-doubt** — No "am I doing this right?" moments. The two-tap pattern is so obvious it can't be done wrong.

### Design Implications

| Emotional Goal | UX Design Decision |
|---|---|
| Effortlessness | Poster grid only. No menu. No settings. No onboarding. The app is immediately usable. |
| Speed as magic | Actual speed from simple HTML/CSS. No animations, no skeletons, no tricks. The page just renders fast. |
| Confidence | Large, obvious click targets. Visual affordances (posters look clickable). Detail page has a clear Play button. Consistent patterns — every poster works the same way. |
| Ownership | "Continue Watching" row personalized from localStorage. Progress bars on posters. Dimmed watched titles. The grid reflects *your* viewing history. |
| Trust | No breaking changes between visits. Same layout, same behavior, same speed. Bookmarked URL always works. |
| Calm | No notifications. No badges. No "X new movies added!" alerts. Content appears organically. Silence is the default. |

### Emotional Design Principles

1. **The best interface is invisible.** If the user is thinking about the interface, we've failed. They should be thinking about what to watch.
2. **Speed builds trust.** Every instant response reinforces "this thing works." Every delay (even 500ms) erodes confidence.
3. **Silence is comfort.** No notifications, no alerts, no status updates for viewers. The library is always there, always ready, always quiet.
4. **Recognition without intrusion.** Watch progress and personalized rows say "I know you" without ever asking for information or requiring setup.
5. **Errors are admin problems, not viewer problems.** Viewers never see failure. If something can't play, it doesn't appear in the library. The system protects Marie from complexity.

## UX Pattern Analysis & Inspiration

### Inspiring Products Analysis

**The Motherfuckingwebsite Series (motherfuckingwebsite.com → bettermotherfuckingwebsite.com → thebestmotherfuckingwebsite.com)**
- Semantic HTML as the foundation, not a framework artifact
- CSS serves readability and spacing — not decoration or animation
- Nothing moves unless the user explicitly acts
- Speed comes from actual simplicity, not perceived-speed tricks layered over complexity
- The content IS the interface

**Hacker News / Lobsters / old.reddit.com**
- Static layouts. Nothing shifts when content loads. No layout jank.
- Click a link → go to a page. Back button works. Bookmarks work. It's the web.
- Information density without visual noise
- Zero JavaScript required for core browsing functionality

**Apple Music (album grid view)**
- Poster/album art grid with clean spacing
- Click → navigates to detail page (not an overlay)
- No hover previews, no autoplay, no expanding cards
- Minimal chrome around the content

### Transferable UX Patterns

| Pattern | Source | Application to Cineplex Rigaud |
|---|---|---|
| **Static grid, no layout shift** | motherfuckingwebsite philosophy | Poster grid renders once, fixed dimensions, nothing moves on hover or load |
| **Click → page navigation** | Standard web (links) | Poster click navigates to `/movie/:id` detail page. No overlays, no modals. Back button returns to grid. |
| **Content as interface** | HN/Lobsters | Posters *are* the navigation. Detail page *is* the movie info. Play button *is* the action. No UI chrome competing with content. |
| **Fixed image dimensions** | Any well-built gallery | All poster slots are pre-sized. Images load into reserved space. Zero cumulative layout shift. |
| **Honest speed** | The web itself | No skeleton screens pretending to be fast. The page IS fast because it's simple HTML + CSS + a few API calls. If it loads in 50ms, show nothing until it's done — don't animate a fake loading state. |
| **Predictable ordering** | File managers, libraries | Three sections in fixed order: Continue Watching → Recently Added → A-Z library. User always knows where things are. No algorithmic surprises. |

### Anti-Patterns to Avoid

| Anti-Pattern | Why it's wrong for this project |
|---|---|
| **Hover-to-expand cards** | Layout shift. Unexpected for touch users. Adds complexity for zero value. |
| **Autoplay previews on hover** | Hostile UX. Bandwidth waste. Startles users. Netflix's worst idea. |
| **Skeleton screens / shimmer effects** | Dishonest — they imply slowness. If the page is fast, just show the content. If it's not fast, fix the speed, don't mask it. |
| **Modal overlays for detail** | Breaks back button. Breaks bookmarking. Adds JS complexity. A page is simpler. |
| **Infinite scroll without URL state** | Breaks back button. User loses position. Use pagination or scroll-position-preserving routes instead. |
| **Hamburger menus** | Hides navigation behind an interaction. We have almost no navigation anyway — don't hide what little exists. |
| **Toast notifications / snackbars** | Noise. Viewers don't need to be notified of anything. Ever. |
| **Animated transitions between routes** | Adds perceived latency. A page that appears instantly is faster than a page that slides in over 300ms. |
| **Genre/category/algorithmic sorting** | Complexity that serves the platform, not the user. A predictable alphabetical library is scannable and trustworthy. Marie always knows where to find a title. |

### Design Inspiration Strategy

**Philosophy: The web is fast when you don't slow it down.**

**Grid Layout Structure:**
1. **Continue Watching** — Titles with localStorage progress. Row only appears if progress exists. Disappears when empty.
2. **Recently Added** — Newest imports. Fixed-size row at the top of the library.
3. **Full Library A-Z** — Everything, alphabetical. The bulk of the page. Predictable, scannable, complete.

No genres. No categories. No algorithmic recommendations. The user always knows where a title is: alphabetical order. The library is a place, not a feed.

**Adopt:**
- Static HTML pages with clean CSS (proper spacing, readable type, good contrast)
- Standard `<a href>` navigation between grid and detail pages
- Pre-sized image containers (no layout shift when posters load)
- Browser-native behaviors: back button, bookmarks, scroll position
- Minimal JavaScript: only for the video player sync logic and search filtering
- Fixed three-section grid order: Continue Watching → Recently Added → A-Z

**Reject:**
- CSS animations/transitions for UI elements (no hover effects, no expand/collapse)
- JavaScript-driven layout changes (no dynamic overlays, no programmatic scroll)
- "Perceived performance" tricks (no skeletons, no shimmer, no optimistic UI)
- Any pattern that requires JavaScript to make the page usable
- Genre sorting, algorithmic recommendations, "because you watched" rows

**Adapt:**
- SPA routing (Angular) but with URL-driven state that behaves like real pages — back button works, routes are bookmarkable, scroll position is preserved
- Lazy loading for images (native `loading="lazy"`) — not intersection observer theatrics
- Video player controls as the one area where interactive JS is justified (sync, subtitles, progress tracking)

## Design System Foundation

### Design System Choice

**Hand-written CSS** — No framework, no utility classes, no component library. Custom semantic CSS written for exactly what this project needs. Nothing more.

### Rationale for Selection

| Factor | Decision |
|---|---|
| **Philosophy alignment** | The motherfuckingwebsite approach means every line of CSS exists for a reason. No unused rules, no overrides fighting a framework's opinions. |
| **Solo developer** | One person means one consistent voice. No design system enforcement needed — you *are* the system. |
| **Minimal UI surface** | The viewer UI is a poster grid + detail pages + video player. That's ~5-6 page types total. Not enough complexity to justify a framework. |
| **No animations/transitions** | Frameworks bring animation utilities you'd disable. Hand-written CSS means nothing to disable. |
| **Performance** | Smallest possible CSS payload. No purging step needed because there's nothing to purge. |
| **Angular compatibility** | Angular component styles (`:host`, `::ng-deep` avoidance, ViewEncapsulation) are easier to reason about with hand-written CSS than with framework integration quirks. |

### Implementation Approach

**CSS Architecture:**
- Angular component-scoped styles for component-specific rules
- One global stylesheet for reset, typography, spacing scale, and color variables
- CSS custom properties (variables) for theming tokens (colors, spacing, font sizes)
- No preprocessor (Sass/Less) unless complexity demands it later — plain CSS custom properties cover the need

**File Structure:**
```
styles/
  reset.css          — Minimal reset (box-sizing, margin removal)
  variables.css      — Design tokens as CSS custom properties
  typography.css     — Font stack, sizes, line heights
  layout.css         — Grid containers, responsive breakpoints
  global.css         — Imports all above
```
Plus Angular component `.css` files for component-specific styles.

**Naming Convention:**
- BEM-lite for global classes (`.poster-grid`, `.poster-grid__item`, `.poster-grid--loading`)
- Angular component encapsulation handles scoping for component styles
- Semantic class names that describe content, not appearance (`.movie-detail`, not `.card-large`)

### Customization Strategy

**Design Tokens (CSS Custom Properties):**
```css
:root {
  /* Spacing scale */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2.5rem;

  /* Colors */
  --color-bg: #1a1a1a;
  --color-surface: #2a2a2a;
  --color-text: #f0f0f0;
  --color-text-muted: #aaa;
  --color-accent: #e65100;

  /* Typography */
  --font-family: system-ui, -apple-system, sans-serif;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.25rem;
  --font-size-xl: 1.75rem;

  /* Layout */
  --poster-width: 180px;
  --poster-ratio: 2 / 3;
  --grid-gap: var(--space-lg);
  --content-max-width: 1400px;
}
```

**Dark theme by default** — media server, movie watching context. Light text on dark background. No theme toggle needed.

**Responsive approach:**
- CSS Grid for poster layout with `auto-fill` and `minmax()` — posters flow naturally
- One or two `@media` breakpoints for poster sizing (larger on mobile, denser on desktop)
- No JavaScript for responsive behavior

## Defining Core Experience

### The Defining Interaction

**"Click a poster. Click Play. It starts."**

This is Cineplex Rigaud described in one sentence. Every architectural decision, every UX choice, and every engineering tradeoff exists to make these three steps feel instant and inevitable. No competitor achieves this for self-hosted media.

The defining experience is not a feature — it's the absence of everything that other media servers put between the user and their movie: buffering, transcoding, loading screens, account setup, app installation, codec warnings, and configuration.

### User Mental Model

**What users bring:** Marie's mental model is a DVD shelf. She sees movies, picks one, puts it in the player, presses play. Cineplex Rigaud must map 1:1 to this model:
- See movies (poster grid) = browsing the shelf
- Pick one (click poster → detail page) = pulling a DVD off the shelf and reading the back
- Press play (click Play button) = putting it in the player
- Back button = putting the DVD back and browsing again

**Marc's mental model** is Netflix/streaming — but faster. He expects a grid, a detail view, a play button. He's used to 2-5 seconds of buffering after hitting play. The "wow" moment for Marc is that there IS no buffer.

**What makes this work:** Standard web navigation. Links. Pages. Back button. Every user already understands this model from using the web for 25 years. There's nothing to learn.

### Success Criteria

| Criterion | Measurement |
|---|---|
| Time from "click Play" to first video frame | < 1000ms |
| Number of clicks from grid to playing video | Exactly 2 (poster → detail page → Play) |
| Back button behavior | Returns to grid at same scroll position |
| Resume flow | 1 click from "Continue Watching" row to playing at saved position |
| User confusion on first visit | Zero — the grid is self-explanatory |
| JavaScript required for browsing | None — links and pages work without JS (video player needs JS) |

### Pattern Analysis

**Established patterns only.** No novel UX required.

| Pattern | Source | Application |
|---|---|---|
| Image grid | Every gallery, app store, streaming service | Poster grid with fixed-size slots |
| Click → detail page | Every e-commerce site, every blog | Standard `<a>` link to `/movie/:id` |
| Play button | Every video player ever made | Large, obvious button on detail page |
| Back button | The web | Browser navigation returns to grid |
| Progress bar on thumbnail | YouTube, Netflix | Thin bar at poster bottom edge |
| Search/filter | Any list-based interface | Text input that filters the A-Z grid |

No user education needed. No onboarding. No tooltips. No tutorial. The patterns are so established that they're invisible.

### Experience Mechanics

**1. Initiation — Browsing the Grid**
- User opens bookmark → poster grid renders immediately (simple HTML)
- Three sections visible: Continue Watching (if progress exists), Recently Added, A-Z Library
- Fixed poster dimensions, `loading="lazy"` for images below the fold
- No JavaScript needed to render the grid

**2. Interaction — Selecting a Title**
- User clicks/taps a poster (it's an `<a>` tag linking to `/movie/:id` or `/show/:id`)
- Browser navigates to detail page
- Detail page shows: poster, title, year, runtime, rating, description, Play button
- For TV shows: season/episode list on the same page

**3. Feedback — Playing**
- User clicks Play
- Video player page loads (or inline `<video>` element appears)
- Playback starts immediately — HTTP range request, no server processing
- For sidecar audio: `<video muted>` + `<audio>` synced via JS (transparent to user)
- Subtitles available via `<track>` element if present

**4. Completion — Done Watching**
- Progress saved to localStorage automatically during playback
- When user navigates away (back button, close tab), progress persists
- Next visit: title appears in "Continue Watching" with progress bar
- When playback reaches near-end: marked as watched

## Visual Design Foundation

### Color System

**Palette:**
```css
:root {
  /* Background */
  --color-bg: #1a1a1a;
  --color-surface: #2a2a2a;
  --color-surface-raised: #333;

  /* Text */
  --color-text: #f0f0f0;
  --color-text-muted: #aaa;
  --color-text-dim: #777;

  /* Accent — Deep Orange */
  --color-accent: #e65100;
  --color-accent-hover: #ff6d00;

  /* Semantic */
  --color-progress: var(--color-accent);
  --color-error: #d32f2f;
  --color-success: #388e3c;
}
```

**Usage:**
- `--color-accent` — Play button, progress bars, active/selected states
- `--color-bg` — Page background
- `--color-surface` — Card/detail page background, poster grid section backgrounds
- `--color-text` — Primary readable text
- `--color-text-muted` — Secondary info (year, runtime, rating)

**Contrast ratios (WCAG AA):**
- `--color-text` on `--color-bg`: 15.3:1 (passes AAA)
- `--color-text-muted` on `--color-bg`: 7.5:1 (passes AA)
- `--color-accent` on `--color-bg`: 4.6:1 (passes AA for large text/buttons)

### Typography System

**Font Stack:**
```css
:root {
  --font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
}
```

**Type Scale (generous):**
```css
:root {
  --font-size-xs: 0.75rem;    /* 12px — timestamps, badges */
  --font-size-sm: 0.875rem;   /* 14px — metadata, secondary text */
  --font-size-base: 1rem;     /* 16px — body text, descriptions */
  --font-size-lg: 1.25rem;    /* 20px — section headers, poster titles */
  --font-size-xl: 1.75rem;    /* 28px — page titles (movie name) */
  --font-size-2xl: 2.25rem;   /* 36px — hero heading if needed */

  --line-height-tight: 1.25;
  --line-height-base: 1.6;
  --line-height-relaxed: 1.8;

  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 700;
}
```

**Typography principles:**
- Generous line-height (`1.6` base) for readability
- System font stack — no external font downloads, instant rendering
- Larger base size (16px) for comfortable reading on all devices
- Clear hierarchy: section labels (`--font-size-lg`), titles (`--font-size-xl`), body (`--font-size-base`)
- Poster titles below grid items use `--font-size-sm` to keep focus on the image

### Spacing & Layout Foundation

**Spacing Scale:**
```css
:root {
  --space-xs: 0.25rem;   /* 4px */
  --space-sm: 0.5rem;    /* 8px */
  --space-md: 1rem;      /* 16px */
  --space-lg: 1.5rem;    /* 24px */
  --space-xl: 2.5rem;    /* 40px */
  --space-2xl: 4rem;     /* 64px */
}
```

**Poster Grid Layout:**
```css
:root {
  --poster-width: 180px;
  --poster-ratio: 2 / 3;   /* Standard movie poster aspect ratio */
  --grid-gap: var(--space-lg);
}

.poster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--poster-width), 1fr));
  gap: var(--grid-gap);
}
```

**Key layout decision: Fixed poster size, fluid grid.**
- Posters are always `180px` wide (minimum)
- CSS Grid `auto-fill` + `minmax()` handles the rest
- A wide desktop shows more posters per row; a phone shows fewer
- User zoom increases effective poster size, reducing count per row
- No media queries needed for poster count — the grid is inherently responsive
- The grid just works at any viewport width or zoom level

**Page Layout:**
```css
:root {
  --content-max-width: 1400px;
  --content-padding: var(--space-lg);
}
```
- Content area has `max-width` for readability on ultrawides
- Generous padding (`--space-lg`) around the page edges
- Sections separated by `--space-xl` or `--space-2xl`

### Accessibility Considerations

- **Contrast:** All text/background combinations meet WCAG AA (4.5:1 for body text, 3:1 for large text)
- **Font sizing:** `rem`-based throughout — respects user's browser font size setting
- **Zoom:** Fixed poster width + auto-fill grid means zoom naturally reduces posters per row without breaking layout
- **Touch targets:** Play button and poster links are large enough (minimum 44x44px tap area) by nature of being poster-sized
- **No motion:** No animations, no transitions, no auto-playing content. Prefers-reduced-motion is satisfied by default.
- **Focus indicators:** Browser-default focus outlines preserved (never `outline: none`). High-contrast focus styles via `--color-accent` for keyboard navigation.

## Design Direction Decision

### Design Directions Explored

Given the project's established design philosophy — semantic HTML, hand-written CSS, no animations, no hover effects, no JavaScript for layout — formal design direction exploration was unnecessary. The direction was defined through the prior steps:

1. **Motherfuckingwebsite minimalism** — Content is the interface. CSS serves readability. Nothing decorative.
2. **Static poster grid** — Fixed poster sizes, fluid CSS Grid, three predictable sections.
3. **Standard page navigation** — Click → detail page → Play. Back button works. Bookmarks work.
4. **Dark theme with deep orange accent** — Movie-watching context. High contrast. Single accent color.

### Chosen Direction

**"Clean dark grid"** — A single, cohesive direction that embodies every decision from prior steps:

- **Background:** Dark (`#1a1a1a`) with lighter surface areas (`#2a2a2a`) for section distinction
- **Grid:** CSS Grid `auto-fill` with `180px` minimum poster width, `24px` gap
- **Posters:** Fixed aspect ratio (2:3), `loading="lazy"`, title below in `--font-size-sm`
- **Progress indicators:** Thin deep orange bar at poster bottom edge (no overlay, no badge)
- **Section headers:** Simple text headers ("Continue Watching", "Recently Added", "Library") in `--font-size-lg`, left-aligned
- **Detail page:** Poster left, text right. Title (`--font-size-xl`), metadata in muted text, description in base size, large deep orange Play button
- **Navigation:** None visible. The grid is the home page. Back button is the nav.

### Design Rationale

| Decision | Why |
|---|---|
| Single direction, not multiple | The design philosophy was defined before this step. Generating alternatives to a clear vision wastes time. |
| Dark theme | Movie-watching context. Posters pop against dark background. Reduces eye strain for evening use. |
| Deep orange accent only for interactive elements | Draws the eye to actions (Play, progress) without competing with poster artwork. |
| No card borders or shadows | Posters don't need containers. The image IS the element. Less visual noise. |
| Generous spacing between sections | Clearly separates Continue Watching / Recently Added / A-Z without needing divider lines. |
| System fonts | Zero download cost. Renders on first paint. Looks native on every OS. |

### Implementation Approach

**HTML Structure (viewer home page):**
```html
<main>
  <!-- Only rendered if localStorage has progress -->
  <section class="library-section">
    <h2>Continue Watching</h2>
    <div class="poster-grid">...</div>
  </section>

  <section class="library-section">
    <h2>Recently Added</h2>
    <div class="poster-grid">...</div>
  </section>

  <section class="library-section">
    <h2>Library</h2>
    <div class="poster-grid">...</div>
  </section>
</main>
```

**HTML Structure (detail page):**
```html
<main class="movie-detail">
  <a href="/" class="back-link">← Back to Library</a>
  <div class="detail-layout">
    <img class="detail-poster" src="..." alt="..." />
    <div class="detail-info">
      <h1>Movie Title</h1>
      <p class="detail-meta">2024 · 2h 15m · PG-13</p>
      <p class="detail-description">...</p>
      <button class="play-button">Play</button>
    </div>
  </div>
</main>
```

No component library. No abstractions. Semantic HTML elements with CSS classes.
