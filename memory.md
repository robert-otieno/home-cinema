# Memory — Home Cinema implementation
Last updated: 2026-11-05 15:58 Africa/Nairobi.

## What was built
The project exists at C:\Aether CC Projects\home-cinema. Source, installed dependencies, lockfile and compiled production bundles are present. The original brief is docs/PROJECT-BRIEF.md.
Core library, metadata, streaming, cinematic browsing, profiles, administration and backup/restore flows are implemented. PROGRESS.md records phase status and remaining production acceptance. README.md contains Windows/Ubuntu installation, LAN, firewall and opt-in startup instructions. ui-registry.md records the design.
Tests: all 35 passed. TypeScript and production build passed. Browser Direct Play/HLS, quality switching, setup, scanning, watchlist, responsive layout and final settings were verified. Live TMDB metadata/artwork verification passed after the user configured their token. Intel Quick Sync encoding passed on this PC.

## Decisions made
Follow the supplied local pnpm/React/Fastify/Drizzle/SQLite architecture. A single trusted household account owns profiles; adult profiles share administration. Hardware Auto self-tests encoders and uses CPU fallback. See AGENTS.md and docs/architecture.md for durable conventions.
No hosted service or public deployment. Do not change firewall, router or startup settings without authorization.

## Problems solved
- Production server bundling initially included native libSQL dependencies. apps/server/tsup.config.ts now externalizes @libsql/client, which is a direct server dependency.
- Fastify static directory handling initially returned 403 at /. An explicit HTML home route fixes it.
- Prefer HLS.js where supported, native HLS as fallback. This fixed a failed native HLS path in the browser. Quality switching now retains position.
- Vite proxy preserves the request host so write-origin checks work in development.
- Libraries and profiles archive rather than deleting viewing state; reconnecting a library retains its identity.
- libSQL local transaction connections and native statement lifetimes caused Windows cleanup timeouts. packages/database/src/index.ts now serializes whole transactions and ordinary operations on one owned local connection. Tests use --expose-gc and release native handles before deleting disposable databases.
- Metadata tests use a controlled fetch response; a separate real-provider CLI also passed. Do not disable tests to work around Windows handle timing.

## Current state
No preview server is intentionally left running. Disposable browser verification used port 8095 and work/browser-qa-data, with a generated clip in work/browser-qa-media. These are not production data.
The real production household account and library have not been configured by the agent. The user has not yet supplied a real movie folder path.
The user added their TMDB credential to the ignored .env. It was validated without printing it. Never read or reproduce the value in chat or memory.
FFmpeg 9.0.2 was installed via winget with authorization. Its local paths are already configured in .env. Node 26.10 and pnpm 11.25 are installed. Machine information is in docs/machine.md.

## Next session starts with
Read AGENTS.md, PROGRESS.md and README.md. Do not scaffold again.
Run pnpm start from the project root. Open http://localhost:8094, let the user create their administrator credentials, and connect their real dedicated movie folder.
Then verify actual metadata matches, LAN playback from a phone/second computer, subtitles/audio, resume, long seeking and concurrent sessions. Follow the exact remaining release limits in PROGRESS.md. Tests and Windows browser playback already passed; broaden checks only for new changes or unresolved acceptance.

## Open questions
Which directory contains the user's movies? Which phones/TVs will be used? Does the user want the documented Private LAN firewall rule or automatic startup enabled?
Physical TV/Safari/phone, Ubuntu/Docker, long-film reliability, broader security review and advanced playback limits remain unverified or incomplete. Do not call the application universally compatible or production certified.

## Follow-up, authentication background
The login/setup screen now replaces its introductory text with a random TMDB backdrop blended behind the form. Implemented apps/server/src/auth-backdrop.ts and public /api/auth/backdrop with a bounded cache separate from private media/artwork. Production cache was warmed without printing credentials. Desktop and mobile browser layout verified. See ui-registry.md for the visual pattern.

## Follow-up, TV support
The user reported that their TV episodes were imported as movies on ANOTHER DEVICE. No remote device was accessed or modified.
Implemented TV organization in migrations 0005/0006, apps/server/src/television.ts, tv-metadata.ts, tv-routes.ts, packages/media-core parsing, apps/web/src/TV.tsx and episode-aware Player. Registered recognizable episodes are reclassified at startup and before unchanged-file scan shortcuts. Existing playable IDs normally remain; duplicate items merge latest profile progress and preserve watchlists. Source files are never changed. Migration 0005 creates a before-TV database snapshot automatically.
Manual episode assignments persist across scans/renames. TV-only roots quarantine unclear names; mixed roots detect common SxxExx/1x02 patterns. TV metadata uses TMDB TV and season APIs, shows only locally registered files, and caches episode stills. Child ratings include TV classifications.
Live The Office metadata passed using generated sample files in work/tv-preview-media/data. Browser verified season selection, episode playback, watched badges, resume and automatic season-1 to season-2 transition. Preview port 8097 was stopped after verification.
For the other device, use docs/tv-upgrade.md: stop server, backup, update source (do not replace .env or data), pnpm install --frozen-lockfile, pnpm build, pnpm start, and scan the existing TV folder. No Git push or remote update was performed.
Final TV validation: TypeScript/build pass and all 47 automated tests pass. Home-Cinema-TV-Upgrade.zip and its guide were saved in this chat outputs. The archive is source-only and excludes credentials and runtime data. No remote-device update or Git push was performed.
Final grouping edge checks also pass: season folders provide a consistent show title/year even when filenames omit it; new viewers start with regular episodes before specials. The upgrade ZIP was refreshed and compared with the final source files. Local port 8094 was restarted successfully; existing account setup was preserved. The other device still requires the documented source update and rescan.

## Movie review and server folder chooser, 2026-11-06
Added Review match badges and adult-only per-movie TMDB search/match with optional year and local corrections. Existing matching preserves playable IDs, files, progress and watchlists.
Added adult-only GET /api/filesystem/folders and FolderPathField dialog with server locations, subfolders, parent navigation and editable full/network path.
Validation: pnpm build and all 49 tests pass, including matching/artwork/history and folder listing/path/auth boundaries. Signed-in browser acceptance remains outstanding; local browser reached sign-in. Other device has not been modified.
Next: install source update on the other device, refresh, review unmatched movies and check its drives/network mounts. No schema changes for this slice.

## Spotlight redesign, 2026-11-07
Applied UI/UX Pro Max guidance to the existing React app. New apps/web/src/cinema-theme.css centralizes near-black/charcoal, ivory and warm amber styling across navigation, artwork cards, discovery, movie/TV details, settings, folder picker, authentication and player controls. App.tsx adds icon/text navigation, aria-pressed TV mode, keyboard skip link and real-data collection shortcuts.
Design source: design-system/home-cinema/MASTER.md. Search video streaming content discovery returned Hero-Centric/OLED/Inter; adapted palette to spotlight amber. No external fonts or new dependencies. Backend/schema/media behavior unchanged.
Validation: pnpm build and all 49 tests passed. Disposable browser checks at 375x812, 812x375 and 1440x1000 confirmed navigation, responsive filters, folder browsing/selection, season switching and skip-link focus. Fixed mobile settings overflow and overly narrow filters. Manual TMDB matching succeeded after one artwork network timeout. Screenshots saved in chat outputs. No real user credentials or media were changed; no remote device or GitHub update.
Continuation: install the source upgrade on the other device while retaining .env and data. Physical devices, reduced-motion runtime emulation and a full accessibility audit remain unverified. CSS includes reduced-motion suppression.

## Contextual TV organization, 2026-11-07
Removed the empty informational TV organization panel. TVReviewPanel now renders only when /tv/review returns files needing manual organization, with an explicit count and assignment instructions. Removed the redundant Open TV library link. Normal TV navigation remains in the main menu.

## Mobile connected folders, 2026-11-07
Grouped each folder's actions in library-actions and named its information block library-info. Folder content now has a visible label. Mobile uses icon/info columns with a full-width action area: Scan and Watch side by side, Disconnect separate. Paths, timestamps and selectors no longer collapse into a narrow column.
Build passes; disposable 375px browser verification confirms full-width selectors and no page overflow. Screenshot in chat outputs. No backend or data changes.

## Catalog cleanup, 2026-11-07
Implemented adult-only catalog listing/removal/re-import routes, migration 0007 catalog_exclusions, and scanner serialization/exclusion checks. Removing entries deletes dependent DB records transactionally, never source media; active playback blocks removal. Bulk missing cleanup checks that roots are online and sources truly absent. Empty TV shows are cleaned when their last episode is removed.
UI: CatalogCleanup in Media library settings searches movies/episodes, filters missing entries, shows paths and offers per-entry/visible-page confirmation. MovieReview also offers direct removal. Global allow-reimport resets exclusions; scanning re-adds existing files without old history. See docs/catalog-cleanup.md.
Validation: build and 58 tests pass. Disposable browser verified cancel, missing deletion, retained duplicate, 375px no overflow. Other device untouched; upgrade package includes all prior work. Next: apply source update on that device, preserve .env/data, build/restart, scan then review cleanup. Never auto-remove records for offline drives.
