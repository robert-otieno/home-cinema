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

## TV pages and episode rows
Files: apps/web/src/TV.tsx, apps/web/src/Player.tsx, apps/web/src/style.css.
Show cards reuse the 2:3 movie poster pattern. TV detail pages reuse the cinematic backdrop and poster layout. The season selector uses the standard dark select; episode rows use a subtle panel, 10px radius, numbered ordering, 16:9 still, synopsis, lime watched badge and progress rail. Rows wrap on mobile and preserve visible focus.
TV Continue Watching uses 16:9 resume cards. Administration keeps manual show matching and unresolved-file organization inside the existing panel system. Player next-episode controls reuse standard buttons and links.

## Movie review and folder chooser, 2026-11-06
MovieReview.tsx reuses panels, standard buttons, inputs and muted copy. Review badges overlay posters. Search and bordered charcoal result rows stack on mobile.
FolderPicker.tsx uses a native modal, dark backdrop, rounded charcoal surface, standard focus, path input, folder rows and footer actions. Escape cancels and focus returns. Adult profiles browse folders belonging to the media server.

## Spotlight design system, 2026-11-07 — supersedes earlier visual tokens
Source of truth: design-system/home-cinema/MASTER.md and apps/web/src/cinema-theme.css, loaded after functional component styles.
Background #090a0c; panel #13151a; raised #1c1f26; border #30343d; ivory #f5f5f7; muted #a7adb8; warm amber #f2bf70 with dark ink #211606. System sans typography, 16px base, 12–14px supporting text, 20px mobile gutters. Rounded controls 10px, panels 16px, posters 12px.
Navigation uses icon/text active pills, mobile four-route navigation and essential account actions. Skip link targets the route content. Poster shelves have consistent widths and scroll snapping. Mobile filters use two columns; settings sections scroll within their container. Primary actions, review badges, episode rows, forms and native dialogs share these tokens. Reduced motion suppresses transitions and hover transforms.
TV organization panels are contextual: render only for unresolved files, with an actionable heading/count and file assignment forms; omit empty guidance-only cards.
Mobile connected folders: 24px icon + flexible information column; full-width 16px select with visible Folder content label, 12px wrapping path/time; separate two-column Scan/Watch actions and a separate Disconnect row. Use library-info and library-actions classes.
