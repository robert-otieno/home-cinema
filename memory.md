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
