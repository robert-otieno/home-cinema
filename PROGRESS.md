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
