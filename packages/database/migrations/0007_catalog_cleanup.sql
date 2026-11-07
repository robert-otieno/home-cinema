CREATE TABLE catalog_exclusions (
 libraryId TEXT NOT NULL REFERENCES libraries(id),
 path TEXT NOT NULL,
 title TEXT NOT NULL,
 removedAt INTEGER NOT NULL,
 PRIMARY KEY (libraryId, path)
);
