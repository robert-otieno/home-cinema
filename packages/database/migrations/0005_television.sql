CREATE TABLE series(id TEXT PRIMARY KEY,identityKey TEXT NOT NULL UNIQUE,title TEXT NOT NULL,year INTEGER,overview TEXT,poster TEXT,backdrop TEXT,tmdbId INTEGER,genres TEXT NOT NULL DEFAULT '[]',cast TEXT NOT NULL DEFAULT '[]',rating REAL,certification TEXT,manual INTEGER NOT NULL DEFAULT 0,review INTEGER NOT NULL DEFAULT 1,addedAt INTEGER NOT NULL);
-- statement-breakpoint
CREATE TABLE seasons(seriesId TEXT NOT NULL REFERENCES series(id),number INTEGER NOT NULL,name TEXT NOT NULL,overview TEXT,poster TEXT,airDate TEXT,PRIMARY KEY(seriesId,number));
-- statement-breakpoint
ALTER TABLE movies ADD COLUMN mediaType TEXT NOT NULL DEFAULT 'movie';
-- statement-breakpoint
ALTER TABLE libraries ADD COLUMN contentType TEXT NOT NULL DEFAULT 'mixed';
-- statement-breakpoint
CREATE TABLE episodes(mediaId TEXT PRIMARY KEY REFERENCES movies(id),seriesId TEXT NOT NULL REFERENCES series(id),season INTEGER NOT NULL,number INTEGER NOT NULL,episodeEnd INTEGER NOT NULL,title TEXT NOT NULL,overview TEXT,airDate TEXT,still TEXT,tmdbId INTEGER,metadataUpdatedAt INTEGER,legacyMetadata TEXT,UNIQUE(seriesId,season,number),FOREIGN KEY(seriesId,season) REFERENCES seasons(seriesId,number));
-- statement-breakpoint
CREATE TABLE series_watchlist(profileId TEXT NOT NULL REFERENCES profiles(id),seriesId TEXT NOT NULL REFERENCES series(id),PRIMARY KEY(profileId,seriesId));
-- statement-breakpoint
CREATE INDEX episode_order ON episodes(seriesId,season,number);
-- statement-breakpoint
CREATE INDEX movies_type ON movies(mediaType,addedAt);

