CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password TEXT NOT NULL,createdAt INTEGER NOT NULL);
-- statement-breakpoint
CREATE TABLE profiles(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,avatar TEXT NOT NULL,pin TEXT,child INTEGER NOT NULL DEFAULT 0);
-- statement-breakpoint
CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),profileId TEXT REFERENCES profiles(id),expiresAt INTEGER NOT NULL);
-- statement-breakpoint
CREATE TABLE libraries(id TEXT PRIMARY KEY,name TEXT NOT NULL,path TEXT NOT NULL UNIQUE,autoScan INTEGER NOT NULL DEFAULT 1,lastScan INTEGER,error TEXT);
-- statement-breakpoint
CREATE TABLE movies(id TEXT PRIMARY KEY,title TEXT NOT NULL,year INTEGER,overview TEXT,rating REAL,genres TEXT NOT NULL DEFAULT '[]',cast TEXT NOT NULL DEFAULT '[]',director TEXT,poster TEXT,backdrop TEXT,tmdbId INTEGER,collection TEXT,manual INTEGER NOT NULL DEFAULT 0,review INTEGER NOT NULL DEFAULT 1,certification TEXT,addedAt INTEGER NOT NULL);
-- statement-breakpoint
CREATE TABLE media_files(id TEXT PRIMARY KEY,movieId TEXT NOT NULL REFERENCES movies(id),libraryId TEXT NOT NULL REFERENCES libraries(id),path TEXT NOT NULL UNIQUE,fingerprint TEXT NOT NULL,size INTEGER NOT NULL,mtime INTEGER NOT NULL,duration REAL NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,videoCodec TEXT,audioCodec TEXT,container TEXT NOT NULL,audioTracks TEXT NOT NULL DEFAULT '[]',subtitles TEXT NOT NULL DEFAULT '[]',available INTEGER NOT NULL DEFAULT 1);
-- statement-breakpoint
CREATE INDEX files_fingerprint ON media_files(fingerprint);
-- statement-breakpoint
CREATE INDEX files_movie ON media_files(movieId);
-- statement-breakpoint
CREATE INDEX movies_title ON movies(title);
-- statement-breakpoint
CREATE TABLE progress(profileId TEXT NOT NULL REFERENCES profiles(id),movieId TEXT NOT NULL REFERENCES movies(id),position REAL NOT NULL,completed INTEGER NOT NULL DEFAULT 0,updatedAt INTEGER NOT NULL,PRIMARY KEY(profileId,movieId));
-- statement-breakpoint
CREATE TABLE watchlist(profileId TEXT NOT NULL REFERENCES profiles(id),movieId TEXT NOT NULL REFERENCES movies(id),PRIMARY KEY(profileId,movieId));
-- statement-breakpoint
CREATE TABLE scan_jobs(id TEXT PRIMARY KEY,libraryId TEXT NOT NULL REFERENCES libraries(id),status TEXT NOT NULL,processed INTEGER NOT NULL DEFAULT 0,errors TEXT NOT NULL DEFAULT '[]',startedAt INTEGER NOT NULL,finishedAt INTEGER);
-- statement-breakpoint
CREATE TABLE playback_sessions(id TEXT PRIMARY KEY,profileId TEXT NOT NULL REFERENCES profiles(id),movieId TEXT NOT NULL REFERENCES movies(id),mode TEXT NOT NULL,quality TEXT NOT NULL,device TEXT NOT NULL,status TEXT NOT NULL,error TEXT,startedAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
-- statement-breakpoint
CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
