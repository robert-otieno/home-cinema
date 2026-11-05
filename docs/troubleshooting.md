# Troubleshooting
## Server will not start
Run from the project root. Build with pnpm build. EADDRINUSE means the port is already occupied. Do not kill unrelated processes. Change PORT in .env or stop your existing cinema process. A new browser build is read from apps/web/dist on start.

## Empty library
Connect a dedicated accessible folder. Check Recent scans for warnings. The server process must have read permission. FFprobe is required for scanning. Reconnect unavailable drives and rescan. Mapped Windows drives may not exist for a service account; use a consistently mounted share with appropriate credentials outside the app.

## FFmpeg missing
Restart the terminal after installing FFmpeg. If needed, set full FFMPEG_PATH and FFPROBE_PATH in .env and restart. The installation path on this PC is recorded in the local .env, which is intentionally ignored by source control.

## Wrong movie information
Leave uncertain matches for review. Search TMDB in settings and explicitly select a match, or edit locally. Set a release year in filenames. Scans preserve manual corrections. TMDB may be unavailable or rate limited; local playback and cached metadata still work.

## Playback fails
Try 720p. Original depends on browser codecs. Auto detection is conservative but cannot guarantee device support. Check server FFmpeg availability, free disk space, active conversion limit, source permissions, and subtitle format. Unsupported subtitle images are not burned in. A slow CPU may not convert 1080p fast enough; Direct Play avoids this cost.

## Conversion stops
The idle timeout, free disk guard, or cache threshold may have stopped it. A sleeping browser can suspend heartbeats. Restart playback. Large forward seeks can wait for the HLS generator.

## Another device cannot connect
Use the LAN address, not localhost. Verify HOST=0.0.0.0, the port, common home network, private firewall scope, and router client isolation. VPN and guest networks can isolate devices. No firewall changes are automatic.

## Child profile has no movies
Only G and PG are allowed, including any manually assigned certification. Unrated movies are hidden. Adult profiles without a PIN require the household password when selected. A child profile cannot use the admin endpoints.

## SQLite busy after testing
Windows may retain file handles briefly. Tests retry deletion. If a test run was forcibly stopped, its temporary directory can remain until process exit. Do not remove the live data directory. Use backup and restore scripts with the server stopped.

## Logging
Fastify writes structured JSON logs to standard output. Capture them through your service manager or shell if needed. Request bodies, cookies, authorization headers, and environment secrets are not logged by the application. Paths and scan errors can be present in administrator diagnostics.
