# Home Cinema — Spotlight
UI/UX Pro Max redesign, 2026-11-07. Applies across authentication, discovery, movies, TV, details, settings and player controls.

## Direction
Content-first, cinematic OLED dark. Verified search: video streaming content discovery, design-system; result Hero-Centric Design, Dark Mode OLED, Inter. The earlier funnel result was rejected as unsuitable.
Adapt the recommended cinema palette to warm spotlight amber, keeping error red distinct from primary actions. No external font dependency; Inter if installed, otherwise Segoe UI/system sans.

## Tokens
Background #090a0c; panel #13151a; raised #1c1f26; border #30343d; foreground #f5f5f7; muted #a7adb8; accent #f2bf70; accent ink #211606.
Rounded surfaces 12–20px, buttons 10px, standard 44px minimum control height. Responsive gutters 20px to 88px. Body 16px, supporting labels 12–14px.
Use Lucide outlines consistently, hide decorative icons, retain text labels and visible focus.

## Layout
Desktop navigation groups content routes with an amber active pill. Mobile retains all four content routes and essential account/settings actions.
Feature artwork with layered near-black scrims and a static primary playback action. No autoplay carousel or decorative animation. Library strip leads to real routes; counts derive from available media.
Poster shelves keep stable aspect ratios, lazy artwork, visible horizontal scrolling, keyboard access and scroll snapping. Settings use clear surface hierarchy and horizontally scrollable section navigation on mobile.
Keep existing TMDB auth backdrop and no promotional headline on login.

## Implementation
apps/web/src/cinema-theme.css layers the visual system after functional component CSS. App.tsx adds semantic navigation, skip link, shortcut strip and clearer discovery copy. Backend, source media and matching/playback contracts are unchanged.
Respect reduced motion. Test desktop/mobile, real form controls and representative movie/TV/settings routes against disposable data.
