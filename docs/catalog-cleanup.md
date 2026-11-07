# Library cleanup
Adult profiles can remove a duplicate or stale library entry without deleting source media.

## Use
In Cinema settings > Media library > Library cleanup:
- Scan the affected connected folder first, then leave Only entries with no available files checked to review deleted/missing media.
- Clear the checkbox and search a film or show title to find duplicate entries. Source paths distinguish copies.
- Choose Remove entry and confirm. For multiple missing entries, Clear these missing entries removes only the displayed page (up to 50).
A film's detail page also has Remove from library.

Removal permanently clears the selected playable records, linked file records, metadata relationships, progress, watch history and list memberships for all profiles. It does not merge duplicate histories. The retained entry and its history are preserved.
Removing the final local episode of a show also clears its empty show/season records.

## Scans and recovery
Migration 0007 adds catalog_exclusions: library/path/title/time only. Scans skip these paths so removed duplicates do not immediately return. No source videos, subtitles or artwork files are deleted.
Expand the removed-paths section and allow re-import to reset all exclusions, then scan. Existing files can be imported again; old viewing history is not restored. Renamed/moved files use a new path and may be imported.
Database removals are transactional and serialized with scans. Active starting/playing sessions block removal.
Bulk missing-only cleanup rechecks source paths and refuses offline/disconnected roots, permission errors or files that have returned. A single manual removal is an explicit removal regardless of availability.

## Verification
Build and 58 tests pass. Coverage includes adult access, confirmation, duplicate preservation, dependent-row cleanup, missing/offline checks, active playback, TV orphan cleanup, rescans, restart, exclusions and re-import.
Disposable browser verification covers cancellation, missing removal, duplicate search/removal and 375px layout. The other device has not been modified.
