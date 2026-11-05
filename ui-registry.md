# Home Cinema UI patterns
Established 2026-11-05 from apps/web/src/style.css and React components. Apply the Imprint skill when extending these patterns.

| Component | Pattern |
| --- | --- |
| Page | #0b0d0c background, ivory #f1f3ed, 4.5% horizontal padding |
| Panel | #141715, 1px #292e29 border, 11px radius, 28px padding |
| Primary action | #d0ef85, #15200e text, 7px radius, 14px 23px padding |
| Secondary action | translucent ivory, light border, 7px radius |
| Label | 9–10px, letter spacing 1.5–2px, muted sage or lime |
| Heading | Segoe UI/Inter system stack, medium weight, tight tracking |
| Muted text | #939b93, comfortable line height |
| Card | 2:3 artwork, 9px radius, title below, 22px shelf gap |
| Artwork fallback | abstract CSS radial gradients and film title, no external fake films |
| Focus | 3px lime outline, 5px offset; stronger in TV mode |
| Responsive | 760px and 1100px breakpoints, desktop six columns |
| Motion | subtle hover lift, disabled under reduced-motion preference |

Movie details, player controls, profile picker, setup form, and admin panels share these tokens. Every action corresponds to API behavior. Empty, loading, unavailable, and error states are explicit.

## Auth screen backdrop, 2026-11-05
File: apps/web/src/App.tsx and apps/web/src/style.css.
Decorative full-bleed TMDB backdrop, cover sizing, 38% horizontal focal position, .82 opacity. A dark horizontal gradient blends into the right-side sign-in form, with top/bottom fades. Form stays in grid column 2 on desktop and is centered on mobile, with translucent charcoal and 14px backdrop blur. Removed the introductory eyebrow, headline and description. Small TMDB credit appears at the bottom. Images come from a bounded public cache separate from private library artwork.
