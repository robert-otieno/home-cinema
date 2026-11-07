# Home Cinema development context
Project: C:\Aether CC Projects\home-cinema. The original requested scope is docs/PROJECT-BRIEF.md.
Read memory.md and PROGRESS.md for current status, docs/architecture.md for the design, and ui-registry.md before UI work.

## Commands
Run from the project root:
- pnpm dev: Fastify watch plus Vite on 5173, API proxy to 8094.
- pnpm build: TypeScript check, web bundle and server bundle.
- pnpm start: compiled server and static web client, default port 8094.
- pnpm test: 49 meaningful checks using synthetic media; requires FFmpeg/FFprobe and a built client.
- pnpm check:metadata: isolated live provider validation. Uses .env without printing secrets.
- pnpm format: format source with Prettier.

## Architecture
React/TypeScript/Vite/Tailwind, TanStack Query, React Router, Lucide, HLS.js. Accessible custom controls. Server: Fastify/Zod, Drizzle SQLite via a local libSQL client, Chokidar, FFmpeg/FFprobe. Workspaces are apps/web, apps/server, packages/database, packages/media-core, packages/shared.
Production serves one origin. The frontend never receives raw filesystem paths for playback. API operations are ID based. Metadata credentials stay server side.
Local database access is gated across whole transactions and ordinary requests, preserving atomicity without libSQL 0.15 GC-owned transaction connections. Do not bypass the gate. Native statement cleanup needs explicit GC in tests before removing temporary databases on Windows.
Hardware Auto performs an actual tiny encode self-test. It uses only supported encoders and falls back to CPU when startup conversion fails.

## Safety and ownership
Never print or persist .env credentials, cookies or passwords in memory or progress files.
Never delete original media, open public remote access, or alter firewall/router/startup settings without explicit user authorization. FFmpeg installation was authorized and completed.
One household account, multiple profiles. Adult profiles share administration; family profiles require G/PG certification.
Do not insert sample movies or test accounts into production data. Keep generated fixtures and test databases in work/ or temporary directories.
Use SQL migrations for schema changes. Preserve watch history and manual metadata during scans.
Keep PROGRESS.md honest about unverified devices and incomplete release requirements. Maintain memory.md for continuation as the user requested.

## Git
integration: off

## Television
The user operates the affected TV library on another device. TV upgrade instructions are docs/tv-upgrade.md.
TV files use stable playable IDs in the legacy movies table, distinguished by mediaType. Normalized series/seasons/episodes and series_watchlist sit above it. Keep the shared playback/progress pipeline, preserve source files and progress, and never reapply movie-provider matching to an episode.
Recognized imports reclassify at startup and during scans, including unchanged files. Manual organization survives future scans and renamed-source recovery. TV-only roots quarantine ambiguous names for review. Episode identity takes priority over sampled fingerprints, so different episodes with identical bytes are not collapsed.



## Spotlight visual system
The 2026-11-07 redesign uses design-system/home-cinema/MASTER.md and apps/web/src/cinema-theme.css (loaded after style.css). New visual work should use these charcoal/ivory/amber tokens. ui-registry.md documents the current patterns. Keep the media-server folder chooser and per-film review workflow.
