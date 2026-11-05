# TV support upgrade
This upgrade adds series, season and episode organization to Home Cinema. It repairs recognized episodes previously imported as movies. Original video files are not renamed, moved or deleted.

## Update the other device
1. Stop its running Home Cinema server (Ctrl+C in its server terminal, or stop its service).
2. Make a backup from the old project root:
       node scripts/backup.mjs C:\Backups\Cinema-before-TV
   Use a new destination. On Linux, use an appropriate backup path such as /home/your-user/backups/cinema-before-tv.
3. Transfer the updated source from this PC, pull your GitHub update, or extract the supplied upgrade ZIP into the existing project directory.
4. Keep that device's existing .env and data directory. The upgrade ZIP excludes both, plus node_modules and generated builds.
5. From the project root:
       pnpm install --frozen-lockfile
       pnpm build
       pnpm start
6. Refresh the browser. In Cinema settings, find the existing TV folder. Choose TV shows for a dedicated TV folder, or Mixed detection if it contains both films and shows. Click Scan.
7. Open TV Shows. Review any uncertain show matches from the show detail page.

On first startup, migrations add TV tables and make a pre-TV SQLite snapshot at DATA_DIR/database/backups/before-tv-<timestamp>.db. Standard episode names are reclassified immediately, including unchanged files. A scan enriches show, season and episode information using that device's TMDB token. No setup reset is required; existing accounts, profiles and progress are retained.

Do not delete the data directory to install this update. The ZIP is source code, not a replacement for your local configuration or database. It has not been pushed to GitHub automatically.

## Supported organization
Examples:
    TV Shows/
      The Office (2005)/
        Season 01/
          The Office S01E01.mkv
          The Office S01E02.mkv
        Season 02/
          The Office 2x01.mkv
        Specials/
          The Office S00E01.mkv

Also supported: numbered files such as Season 02/01 - Episode name.mp4, and combined files such as S01E03E04 or S01E03-E04. Combined episodes appear once as a range and share the file's progress.

Use season zero for specials. Daily date-based episodes, absolute anime numbering without season context, and unusual naming may need manual organization. The app does not guess a season from an ambiguous number.

## Existing imports and manual review
A playable item retains its original ID when reclassified normally. Episode copies group by series/season/episode identity. If multiple old items represent one episode, progress is merged using the most recently updated profile record and watchlists are retained. Original catalog metadata is saved as legacy metadata for recovery.

A TV-only folder quarantines unclear filenames instead of displaying them as movies. Cinema settings lists those files under TV organization. Select an existing show, or enter a new title and optional year, then assign season and episode. Manual assignments survive later scans and renamed-file recovery.

If the correct show is grouped but its TMDB information is uncertain, open the show and use Manage show information. Search TMDB TV, select the right show, or edit the local title, synopsis and content certification. No provider-only episode is shown as playable.

## Viewing
Each series has a season selector and numerically ordered local episodes, with availability, resume progress and watched badges. Continue Watching includes TV series, and show watchlists are profile-specific.

The player uses the same protected Direct Play, HLS, subtitle and audio services as movies. Next episode selects the next available local episode, crossing season boundaries. It skips gaps for which no local file exists. Automatic next playback can be disabled in player settings; this is a device preference.

Child profiles allow G, PG, TV-Y, TV-Y7, TV-Y7-FV, TV-G and TV-PG. Unrated, TV-14 and TV-MA series remain hidden. Adult profiles retain administration access.

## Validation
Automated tests cover parser patterns, old-database migration and backup, legacy progress preservation, duplicate handling, repeated scans, season ordering, specials, combined files, unknown-name review, manual assignment persistence, authenticated episode streaming, next-season selection, offline TV metadata, child restrictions and restart persistence.
Browser checks with generated media and live TMDB covered show cards, season selection, episode artwork/names, playback, watched status, resume, and automatic cross-season playback.

The other device's real filenames and physical playback hardware still need acceptance testing after installation.
