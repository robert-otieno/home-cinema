# Database
SQLite lives in DATA_DIR/database/cinema.db. Drizzle uses a local libSQL file client. SQL migrations in packages/database/migrations are applied once inside write transactions and recorded in migrations. Foreign keys and WAL are enabled.

| Entity | Relationships |
| --- | --- |
| users | Local household administrator, many profiles and auth sessions |
| profiles | One user, many progress, watchlist and history rows |
| auth_sessions | Hashed token, user and selected profile, expiry |
| libraries | Canonical path, archive state, scan settings and availability warnings |
| movies | Descriptive data plus small JSON display projections for API efficiency |
| media_files | One movie and library, technical properties and file fingerprint |
| genres, movie_genres | Normalized many to many genre membership |
| people, movie_credits | Normalized people and roles, provider IDs |
| metadata_matches | Provider identity, match confidence, cached response snapshot |
| movie_artwork | Cached image references per movie and type |
| audio_tracks, subtitle_tracks | Tracks indexed by source file and stream index |
| progress | Composite profile/movie key, current time and completion |
| watch_history | Individual completion events |
| watchlist | Composite profile/movie key |
| playback_sessions | Profile, source movie, mode, quality, device and status |
| scan_jobs | Library, queue state, processed count and bounded errors |
| transcode_jobs | Playback session, encoder, quality and lifecycle |
| settings | Versionable JSON preferences |

Movie JSON arrays are denormalized read projections; genre, credit, and embedded track relations are also maintained transactionally. Provider responses retain additional metadata. External subtitle files are discovered beside the media at playback time.

Library disconnect uses archival, retains relationships, and marks sources unavailable. No database deletion invokes filesystem deletion of original media. Deleting cached artwork only targets generated cache filenames. The streaming engine accepts IDs, never raw client paths.

A future PostgreSQL port requires a dialect/schema adapter, migrations, and JSON search replacement. Services are separated from UI, but this is not a claim of a drop-in database switch.
A single owned local connection gates ordinary operations and whole transactions. This preserves atomic updates across concurrent requests and avoids GC-owned transaction connection lifetimes in the native driver.

## TV entities
Series -> seasons -> episodes. An episode links to its existing playable ID in the legacy movies table, which now includes mediaType (movie, episode, unclassified). Existing media_files, progress, watch_history, playback_sessions, audio and subtitle foreign keys remain valid. series_watchlist provides profile-specific show watchlists.
Logical episode identity is unique per series/season/number. episodeEnd describes combined files. legacyMetadata retains the original mistaken movie record. manualOrganization protects explicit corrections from automatic rescans.
Migration 0005 snapshots the pre-TV database before changes. Migration 0006 adds the manual organization flag. No movie-file deletion is involved in conversion.
