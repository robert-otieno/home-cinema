# Security implementation and release limits
Passwords and profile PINs use salted scrypt. Random session tokens are stored as SHA-256 hashes. Cookies are HttpOnly, SameSite strict, and optionally Secure. Sessions expire after 30 days. Sign-out removes the session.

API writes reject cross-origin browser requests. No permissive CORS is enabled. Setup and login are rate limited. Zod validates bodies and query bounds. SQL queries use bound parameters. Profile state is scoped by the authenticated session. Child profiles require allowlisted certifications and cannot administer libraries, metadata, settings, system information, or backups. Adult profile switching requires its PIN or the household password.

Playback, subtitles, artwork, HLS playlists, and segments require authentication. Playback session ownership is rechecked. Canonical filesystem paths must stay under the configured canonical root. Scans skip symbolic links. FFmpeg is spawned without a shell. HLS filenames and cached artwork names use restricted patterns. Source files are never deleted.

Secrets stay in .env, not browser bundles, metadata URLs, logs, or memory. Protect .env and the data/backup directories with OS permissions. Password hashes and viewing history are private.

Release limits: trusted LAN HTTP has no transport encryption. Configure HTTPS before use on untrusted networks. No external access or router changes are performed. Setup is first-come until an administrator is created, so perform it on the host before granting LAN access. No independent penetration test, dependency security audit, or physical TV testing has been completed. Hardware encoders must pass a synthetic self-test; Intel QSV was verified on this PC. Restore is an offline CLI operation, not a web upload endpoint.

The application is intended for one trusted household account with multiple viewing profiles. Adult profiles share administration. Do not treat profiles as isolated, untrusted tenants. Authentication bypass and anonymous household access are not implemented.

