# Home Cinema
Your films. Your home. Your cinema.

A working local media server and responsive cinema client. React, Vite, TypeScript, Fastify, SQLite with Drizzle, FFmpeg, and HLS.js. No cloud database. Only stream files you own or are authorized to access.

Read PROGRESS.md for verified features and remaining production work. This is a development release, not a claim of universal TV compatibility.

## Start on this PC
The project is at C:\Aether CC Projects\home-cinema. FFmpeg 9.0.2 was installed with your authorization. The local .env points to its executable location.

Open PowerShell in the project:
    pnpm start

Open http://localhost:8094. Create your household administrator account, using a password of at least 12 characters. Connect a dedicated movie folder in Cinema settings. The first scan runs automatically. No demonstration films are inserted into your real library.

For development:
    pnpm dev

The browser dev server is http://127.0.0.1:5173 and proxies the API. For production, Fastify serves the built client and API together on 8094. Run commands from the project root.

## Install on Windows 11
Install Node.js 24 LTS or newer and pnpm 11. Node 26.10 was used for development. You can install pnpm with npm install -g pnpm@11.

Install FFmpeg yourself if needed:
    winget install --id Gyan.FFmpeg -e --source winget

Restart your terminal after installation. Check node --version, pnpm --version, ffmpeg -version, and ffprobe -version. Then:
    powershell -File scripts/install.ps1

The script installs project dependencies and builds. It does not install system dependencies, register startup tasks, or alter the firewall.

## Install on Ubuntu
Install Node.js 24 LTS from your chosen trusted distribution, pnpm 11, and FFmpeg. On Ubuntu, the FFmpeg package can be installed with:
    sudo apt update
    sudo apt install ffmpeg

Then:
    bash scripts/install.sh
    pnpm start

Use a service account with read permission to your movie folders and write permission only to DATA_DIR. Mounted network shares must be mounted by the operating system before scanning. Configure filesystem ownership appropriately. This Linux path has not yet been tested on a physical Ubuntu host.

## Configuration
Copy .env.example to .env before your first start. Never commit .env.

| Variable | Meaning |
| --- | --- |
| HOST | Bind address, 0.0.0.0 for LAN or 127.0.0.1 for this PC only |
| PORT | Default 8094 |
| DATA_DIR | Local writable state directory, default ./data |
| FFMPEG_PATH | Executable name or full path |
| FFPROBE_PATH | Executable name or full path |
| TMDB_TOKEN | Optional TMDB API read access bearer token |
| HARDWARE_ACCELERATION | auto, cpu, h264_qsv, h264_nvenc, h264_amf, or h264_vaapi |
| VAAPI_DEVICE | Linux device path, default /dev/dri/renderD128 |
| MAX_TRANSCODES | Default 1, maximum 4 |
| TRANSCODE_CACHE_GB | Default 8, total temporary conversion cache threshold |
| SECURE_COOKIES | false for local HTTP; use true behind correctly configured HTTPS |

Paths containing spaces may be quoted in .env. Use forward slashes in Windows paths to avoid ambiguity. Restart after .env changes. Preferences saved in the admin UI override the two transcode settings on later starts.

The metadata token stays on the server. Obtain your own token at https://www.themoviedb.org/settings/api. Follow TMDB terms and the attribution guidance linked from Cinema settings. Films still appear from filenames when no token is configured. Cached library metadata and artwork remain usable offline.

## Add your films
Connect directories such as D:\Movies, /mnt/movies, or a mounted network share. Do not use the application directory, its data directory, or the whole system drive. The server never moves or deletes your media.

Supported extensions: MP4, MKV, MOV, AVI, M4V, WebM. Actual codec support depends on FFmpeg and the browser. Use names such as Movies/Interstellar (2014)/Interstellar.mkv. A serial scan probes sources, samples file fingerprints to group identical copies, and preserves movie IDs when a missing source moves. Identical sampled regions are a practical duplicate heuristic, not a full-file identity guarantee.

Automatic libraries are watched, scanned at startup, and reconciled every ten minutes. Disconnecting a library archives its root and marks its files unavailable. Reconnecting the same root reuses the library and preserves progress.

Uncertain metadata remains flagged for review. In Movie information, search TMDB and choose the exact match, or edit the title, year, certification, and synopsis locally. Explicitly choosing a provider match replaces prior local corrections. Background scans preserve them. Family profiles show only G and PG films. Set certifications manually when appropriate; unrated media is hidden.

## Playback
Auto prefers Direct Play for common containers/codecs, remuxes H.264/AAC into HLS when appropriate, and otherwise converts to H.264/AAC. Original attempts the original file, so browser codec support still matters. Choose 720p or 1080p for compatibility conversion. These are maximum dimensions; small sources are not upscaled.

The client uses HLS.js when Media Source Extensions are supported, with native HLS fallback. Quality and audio changes create a new session and preserve position. CPU fallback uses two encoding threads. Only one conversion runs by default.

The player supports pause, seek, volume, mute, fullscreen, speed, quality and audio selection, external SRT/WebVTT, and common embedded text subtitles. Image based subtitles (PGS/VobSub) require a future burn-in implementation. SRT/ASS conversion loses unsupported styling.

Progress saves about every ten seconds and on pause, seek, exit, and quality change. A film is completed at 95%. Browsers may prevent autoplay; press Play.

Keyboard: Space/K pauses, arrows seek ten seconds or adjust volume, M mutes, F requests fullscreen. TV mode increases focus visibility and enables directional navigation. Physical remotes and smart TV browsers require testing.

Sessions expire after roughly 90 seconds without a heartbeat. HLS directories are removed on session end and startup. Conversion refuses to start below 2 GB free. A periodic monitor stops conversions below 1 GB free or above the cache limit. Limits can overshoot between checks. HLS is progressively generated with one rendition, not an adaptive bitrate ladder. Seeking far ahead may wait until FFmpeg generates that portion.

Hardware encoders are self-tested with a tiny synthetic video. Auto selects a working Intel QSV, NVIDIA NVENC, AMD AMF, or Linux VA-API encoder. A startup conversion failure retries on CPU. The Intel HD Graphics 530 on this PC passed the Quick Sync test. Other GPUs and drivers still require testing. Choose Direct Play for 4K when supported by your browser.

## Access from another device
Find the PC LAN address with ipconfig on Windows, or hostname -I on Linux. Cinema settings shows connection URLs and a QR code. On the same LAN, open http://YOUR-LAN-IP:8094. Reserve that address through your router DHCP settings.

Windows may block inbound requests. If you choose to allow access, run an Administrator PowerShell:
    New-NetFirewallRule -DisplayName "Home Cinema LAN" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8094 -Profile Private -RemoteAddress LocalSubnet

This command has NOT been run. Use a trusted Private home network. Remove with Remove-NetFirewallRule -DisplayName "Home Cinema LAN".

Ubuntu users can optionally allow the port only from their actual local subnet with ufw. Do not copy a guessed subnet. Never configure router port forwarding. For future remote use, prefer a private VPN with a separate security review.

LAN HTTP does not encrypt passwords or media. Use a trusted network, or configure HTTPS through a local reverse proxy and SECURE_COOKIES=true. Sessions use HttpOnly, SameSite strict cookies. All media and HLS endpoints require authentication.

## Startup after reboot
On Windows, run scripts/windows-startup.ps1 yourself if you want a scheduled task at sign-in. This has NOT been registered. Review the task user and permissions. Remove with Unregister-ScheduledTask -TaskName "Home Cinema".

On Ubuntu, adapt scripts/home-cinema.service to your user, project path, Node executable, and writable data path. Then install and enable it using systemctl. This has NOT been installed or tested here.

Optional Linux Docker:
    MOVIES_DIR=/absolute/movie/path docker compose up --build -d

Add /media/movies as the library. The data volume persists separately. No Docker build or deployment has been performed here.

## Backup and restore
A consistent SQLite snapshot plus cached artwork:
    node scripts/backup.mjs C:\Backups\Cinema-2026-11-05

Use a new destination. Stop scans for a complete consistent artwork snapshot. Actual movies and .env are excluded. Back up media separately. Backups include password hashes and viewing information; store privately.

Stop the server, then:
    node scripts/restore.mjs C:\Backups\Cinema-2026-11-05 --confirm

The command verifies database integrity and preserves existing data in a timestamped directory before copying the backup. Automatic restore requires DATA_DIR to be a dedicated subdirectory inside the project. Restore external data manually with the server stopped. Keep .env, reconnect media drives, start, and scan.

The admin JSON export is a portable diagnostic export. The CLI snapshot is the restore format.

## Validation
    pnpm typecheck
    pnpm test
    pnpm build

Tests generate a short synthetic H.264/AAC fixture without downloading films. They require FFmpeg/FFprobe and a built web client, use isolated databases, and include Windows SQLite cleanup retries and explicit test-only garbage collection.

Browser verification covered setup, generated film scanning, Direct Play, HLS conversion, quality switching with position preservation, watchlists, and responsive layouts. Live TMDB matching/artwork and Intel Quick Sync also passed. Phone, TV, other GPU hardware, Ubuntu, and Docker verification remain separate.

See docs/troubleshooting.md, docs/database.md, docs/security.md, and PROGRESS.md. For a fresh development chat, read memory.md first. No secrets are saved in memory.


Live metadata check: pnpm check:metadata. This uses your server-side .env token and an isolated temporary library; it never prints the credential.
When using a loopback reverse proxy for HTTPS, set TRUST_PROXY=true, preserve Host, forward X-Forwarded-Proto, and bind the app to loopback. Only 127.0.0.1 is trusted as the proxy.

