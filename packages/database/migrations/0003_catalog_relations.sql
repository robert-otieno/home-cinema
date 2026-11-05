CREATE TABLE genres(name TEXT PRIMARY KEY);
-- statement-breakpoint
CREATE TABLE movie_genres(movieId TEXT NOT NULL REFERENCES movies(id),genre TEXT NOT NULL REFERENCES genres(name),PRIMARY KEY(movieId,genre));
-- statement-breakpoint
CREATE INDEX genre_movies ON movie_genres(genre,movieId);
-- statement-breakpoint
CREATE TABLE people(id TEXT PRIMARY KEY,name TEXT NOT NULL,providerId INTEGER);
-- statement-breakpoint
CREATE INDEX people_name ON people(name);
-- statement-breakpoint
CREATE TABLE movie_credits(movieId TEXT NOT NULL REFERENCES movies(id),personId TEXT NOT NULL REFERENCES people(id),role TEXT NOT NULL,character TEXT NOT NULL DEFAULT '',ordering INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(movieId,personId,role,character));
-- statement-breakpoint
CREATE TABLE metadata_matches(movieId TEXT NOT NULL REFERENCES movies(id),provider TEXT NOT NULL,providerId INTEGER NOT NULL,confidence REAL NOT NULL,manual INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL,updatedAt INTEGER NOT NULL,PRIMARY KEY(movieId,provider));
-- statement-breakpoint
CREATE TABLE movie_artwork(movieId TEXT NOT NULL REFERENCES movies(id),kind TEXT NOT NULL,uri TEXT NOT NULL,provider TEXT NOT NULL,PRIMARY KEY(movieId,kind));
-- statement-breakpoint
CREATE TABLE audio_tracks(fileId TEXT NOT NULL REFERENCES media_files(id),streamIndex INTEGER NOT NULL,codec TEXT NOT NULL,language TEXT NOT NULL,title TEXT NOT NULL,PRIMARY KEY(fileId,streamIndex));
-- statement-breakpoint
CREATE TABLE subtitle_tracks(fileId TEXT NOT NULL REFERENCES media_files(id),streamIndex INTEGER NOT NULL,codec TEXT NOT NULL,language TEXT NOT NULL,title TEXT NOT NULL,PRIMARY KEY(fileId,streamIndex));
-- statement-breakpoint
CREATE TABLE watch_history(id TEXT PRIMARY KEY,profileId TEXT NOT NULL REFERENCES profiles(id),movieId TEXT NOT NULL REFERENCES movies(id),completedAt INTEGER NOT NULL);
-- statement-breakpoint
CREATE INDEX history_profile ON watch_history(profileId,completedAt);
-- statement-breakpoint
CREATE TABLE transcode_jobs(sessionId TEXT PRIMARY KEY REFERENCES playback_sessions(id),status TEXT NOT NULL,encoder TEXT NOT NULL,quality TEXT NOT NULL,startedAt INTEGER NOT NULL,finishedAt INTEGER,error TEXT);
-- statement-breakpoint
ALTER TABLE movies ADD COLUMN originalTitle TEXT;
-- statement-breakpoint
ALTER TABLE movies ADD COLUMN releaseDate TEXT;
-- statement-breakpoint
ALTER TABLE movies ADD COLUMN language TEXT;
-- statement-breakpoint
ALTER TABLE movies ADD COLUMN countries TEXT NOT NULL DEFAULT '[]';
-- statement-breakpoint
ALTER TABLE movies ADD COLUMN trailers TEXT NOT NULL DEFAULT '[]';
-- statement-breakpoint
INSERT OR IGNORE INTO genres SELECT DISTINCT value FROM movies,json_each(movies.genres);
-- statement-breakpoint
INSERT OR IGNORE INTO movie_genres SELECT movies.id,value FROM movies,json_each(movies.genres);
-- statement-breakpoint
INSERT OR IGNORE INTO audio_tracks SELECT media_files.id,json_extract(value,'$.index'),json_extract(value,'$.codec'),json_extract(value,'$.language'),json_extract(value,'$.title') FROM media_files,json_each(media_files.audioTracks);
-- statement-breakpoint
INSERT OR IGNORE INTO subtitle_tracks SELECT media_files.id,json_extract(value,'$.index'),json_extract(value,'$.codec'),json_extract(value,'$.language'),json_extract(value,'$.title') FROM media_files,json_each(media_files.subtitles);
