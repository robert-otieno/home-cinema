# Home Cinema progress
Updated: 2026-11-05, 15:58 Africa/Nairobi.
Status: working development release. Core movie-library and streaming flows are implemented. Production sign-off and physical device acceptance are still open.

## Verified
- pnpm typecheck passes.
- pnpm build passes and the compiled server starts and serves the React client.
- pnpm test passes all 47 checks, including real FFmpeg media processing.
- Browser: household setup, folder connection, generated film discovery, Direct Play, HLS decoding, quality switching with retained position, watchlist, mobile and desktop layouts, settings, hardware diagnostics, and offline credits.
- Live TMDB: user-configured token matched Interstellar (2014), returned metadata, and downloaded poster and backdrop. The test used an isolated database and did not populate the real library.
- Intel HD Graphics 530 passed actual Quick Sync encoding; the server reports h264_qsv as supported.

## Phase status
| Phase | Completed implementation | Acceptance still needed |
| --- | --- | --- |
| 1. Foundation | pnpm monorepo, React/Fastify, SQLite/Drizzle migrations, secure setup/login, libraries, serial scans, FFprobe facts, duplicate grouping, moved/missing files, directory watching, startup and periodic scans | User must connect their real movie folder; generated media acceptance passed |
| 2. Metadata | TMDB provider interface, conservative confidence matching, normalized credits/genres, cached provider responses/artwork, manual match/corrections, refresh guard, trailers, certifications, local backdrop fallback, official attribution | Review a representative set of the user's actual filenames and matches |
| 3. Playback | Authenticated byte ranges, Direct Play, MKV remux, H.264/AAC HLS, audio choice, external/embedded text subtitles, watch progress/history, idle cleanup, disk and concurrency limits, hardware self-tests and CPU fallback | Physical phone/computer LAN playback, long films and varied codecs |
| 4. Interface | Cinematic hero, actual-library shelves/collections, details, SQL search/filter/sort/pagination, recommendations, continue watching, watchlist, empty/error/loading states | Visual review with the actual library's posters/backdrops |
| 5. Household/TV | Per-profile history/watchlists, avatars, PINs, family certification filtering, edit/archive, password rotation with device sign-out, directional focus and back navigation, responsive controls | Physical smart TV/remotes and Safari/iOS |
| 6. Administration | Library scan controls, metadata editor, runtime preferences, active sessions/errors, CPU/RAM/disk and FFmpeg diagnostics, connection URLs/QR, cache pruning, backup/restore, Windows/Ubuntu instructions, startup templates, Docker source | Opt-in firewall/startup, Ubuntu/Docker execution, broader security and reliability review |

## Deliberate release limits
- One trusted household account with multiple viewing profiles. Adult profiles share administration. Anonymous/no-login mode and multiple account roles are not implemented.
- HLS provides one progressively generated rendition. Adaptive bitrate ladders and restart-at-seek generation are not implemented; far-forward seeking can wait for generation.
- Direct Play can handle compatible 4K; conversion targets at most 1080p or 720p. HDR tone mapping and dedicated 4K transcode profiles are not implemented.
- PGS/VobSub images are reported but are not burned in. Text subtitle styling may be reduced.
- Windows Intel QSV was tested. NVIDIA, AMD, Linux VA-API and other drivers still need physical validation.
- PWA/service-worker support, casting, dedicated clients, offline downloads, remote access and PostgreSQL are future extensions.
- Home shelves use the latest 200 movies; complete browsing and search use database pagination.
- Fingerprints sample media regions, so duplicate detection is a practical heuristic.
- Ports, binding, media tool paths and provider credentials are configured in .env. Preferences expose supported runtime controls.
- The UI uses accessible native controls and custom CSS with Tailwind, rather than a generated shadcn component layer.
- No firewall, router, startup task, systemd service, Docker service, or public deployment was configured automatically.
- Tests and browser verification do not establish production readiness or universal device compatibility.

## Next acceptance run
1. Run pnpm start from the project root and open http://localhost:8094.
2. Create the real household administrator account. The production database has not been initialized by test accounts.
3. Add the user's dedicated movie directory. No real folder path was provided in chat.
4. Review metadata matches and stream representative MP4, MKV and incompatible codec files.
5. Test the connection URL from another home device. Enable only a local-subnet Private firewall rule if the user chooses.
6. Test real resume, long seeks, subtitle/audio changes, and concurrent use on the user's devices.
7. Ratify the remaining release limits before calling this production ready.

## Continuation
Read memory.md, AGENTS.md, README.md and this file before changing code. All source is in this project directory. Secrets remain in the ignored .env; never copy them to progress, memory, logs, screenshots or deliverables.

## Update, authentication background
Replaced the login/setup introductory copy with a random cached TMDB movie backdrop. apps/server/src/auth-backdrop.ts keeps up to eight provider-selected JPEGs in DATA_DIR/cache/auth-backdrops, refreshes daily, and reuses the pool offline. Only /api/auth/backdrop is public; private library artwork and media remain protected. Live downloads, desktop/mobile layout, build and authentication boundaries were checked.

## TV support completed
Series/season/episode data, conservative filename parsing, TV metadata and artwork, local-only episode listing, show watchlists, TV continue watching, episode progress, automatic next playback, specials and combined files are implemented.
Migrations 0005 and 0006 preserve the playable-item store and add pre-TV database backup plus durable manual organization. Registered episodes are reclassified at startup and before unchanged-file shortcuts on scans. No source files are changed.
Live TMDB verification used The Office (2005) with four generated local sample episodes. Browser verification passed for season selection, episode names/artwork, Direct Play, resume, watched badges and automatic cross-season playback.
The user's affected TV library is on another device. That device has NOT been modified from this chat. Its upgrade/rescan instructions are docs/tv-upgrade.md. Physical playback and real filename acceptance on that device remain outstanding.

Final TV validation: pnpm build and all 47 tests pass. The source-only upgrade ZIP excludes .env, data, node_modules, work and generated builds.

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
