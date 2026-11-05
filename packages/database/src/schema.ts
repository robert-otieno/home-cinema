import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text().primaryKey(),
  username: text().notNull().unique(),
  password: text().notNull(),
  createdAt: integer().notNull(),
});
export const profiles = sqliteTable("profiles", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id),
  name: text().notNull(),
  avatar: text().notNull(),
  pin: text(),
  archived: integer({ mode: "boolean" }).notNull().default(false),
  child: integer({ mode: "boolean" }).notNull().default(false),
});
export const authSessions = sqliteTable("auth_sessions", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id),
  profileId: text().references(() => profiles.id),
  expiresAt: integer().notNull(),
});
export const libraries = sqliteTable("libraries", {
  id: text().primaryKey(),
  name: text().notNull(),
  path: text().notNull().unique(),
  autoScan: integer({ mode: "boolean" }).notNull().default(true),
  archived: integer({ mode: "boolean" }).notNull().default(false),
  lastScan: integer(),
  error: text(),
});
export const movies = sqliteTable(
  "movies",
  {
    id: text().primaryKey(),
    title: text().notNull(),
    year: integer(),
    overview: text(),
    rating: real(),
    genres: text({ mode: "json" }).$type<string[]>().notNull().default([]),
    cast: text({ mode: "json" }).$type<string[]>().notNull().default([]),
    director: text(),
    poster: text(),
    backdrop: text(),
    tmdbId: integer(),
    collection: text(),
    manual: integer({ mode: "boolean" }).notNull().default(false),
    review: integer({ mode: "boolean" }).notNull().default(true),
    certification: text(),
    originalTitle: text(),
    releaseDate: text(),
    language: text(),
    countries: text({ mode: "json" }).$type<string[]>().notNull().default([]),
    trailers: text({ mode: "json" })
      .$type<{ name: string; url: string }[]>()
      .notNull()
      .default([]),
    addedAt: integer().notNull(),
  },
  (t) => [index("movies_title").on(t.title)],
);
export const mediaFiles = sqliteTable(
  "media_files",
  {
    id: text().primaryKey(),
    movieId: text()
      .notNull()
      .references(() => movies.id),
    libraryId: text()
      .notNull()
      .references(() => libraries.id),
    path: text().notNull().unique(),
    fingerprint: text().notNull(),
    size: integer().notNull(),
    mtime: integer().notNull(),
    duration: real().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    videoCodec: text(),
    audioCodec: text(),
    container: text().notNull(),
    audioTracks: text({ mode: "json" }).$type<any[]>().notNull().default([]),
    subtitles: text({ mode: "json" }).$type<any[]>().notNull().default([]),
    available: integer({ mode: "boolean" }).notNull().default(true),
  },
  (t) => [
    index("files_fingerprint").on(t.fingerprint),
    index("files_movie").on(t.movieId),
  ],
);
export const progress = sqliteTable(
  "progress",
  {
    profileId: text()
      .notNull()
      .references(() => profiles.id),
    movieId: text()
      .notNull()
      .references(() => movies.id),
    position: real().notNull(),
    completed: integer({ mode: "boolean" }).notNull().default(false),
    updatedAt: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.movieId] })],
);
export const watchlist = sqliteTable(
  "watchlist",
  {
    profileId: text()
      .notNull()
      .references(() => profiles.id),
    movieId: text()
      .notNull()
      .references(() => movies.id),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.movieId] })],
);
export const scanJobs = sqliteTable("scan_jobs", {
  id: text().primaryKey(),
  libraryId: text()
    .notNull()
    .references(() => libraries.id),
  status: text().notNull(),
  processed: integer().notNull().default(0),
  errors: text({ mode: "json" }).$type<string[]>().notNull().default([]),
  startedAt: integer().notNull(),
  finishedAt: integer(),
});
export const playbackSessions = sqliteTable("playback_sessions", {
  id: text().primaryKey(),
  profileId: text()
    .notNull()
    .references(() => profiles.id),
  movieId: text()
    .notNull()
    .references(() => movies.id),
  mode: text().notNull(),
  quality: text().notNull(),
  device: text().notNull(),
  status: text().notNull(),
  error: text(),
  startedAt: integer().notNull(),
  updatedAt: integer().notNull(),
});
export const settings = sqliteTable("settings", {
  key: text().primaryKey(),
  value: text().notNull(),
});

export const genres = sqliteTable("genres", { name: text().primaryKey() });
export const movieGenres = sqliteTable(
  "movie_genres",
  {
    movieId: text()
      .notNull()
      .references(() => movies.id),
    genre: text()
      .notNull()
      .references(() => genres.name),
  },
  (t) => [primaryKey({ columns: [t.movieId, t.genre] })],
);
export const people = sqliteTable("people", {
  id: text().primaryKey(),
  name: text().notNull(),
  providerId: integer(),
});
export const movieCredits = sqliteTable(
  "movie_credits",
  {
    movieId: text()
      .notNull()
      .references(() => movies.id),
    personId: text()
      .notNull()
      .references(() => people.id),
    role: text().notNull(),
    character: text().notNull().default(""),
    ordering: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.movieId, t.personId, t.role, t.character] }),
  ],
);
export const metadataMatches = sqliteTable(
  "metadata_matches",
  {
    movieId: text()
      .notNull()
      .references(() => movies.id),
    provider: text().notNull(),
    providerId: integer().notNull(),
    confidence: real().notNull(),
    manual: integer({ mode: "boolean" }).notNull().default(false),
    payload: text({ mode: "json" }).$type<Record<string, any>>().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.movieId, t.provider] })],
);
export const movieArtwork = sqliteTable(
  "movie_artwork",
  {
    movieId: text()
      .notNull()
      .references(() => movies.id),
    kind: text().notNull(),
    uri: text().notNull(),
    provider: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.movieId, t.kind] })],
);
export const audioTracks = sqliteTable(
  "audio_tracks",
  {
    fileId: text()
      .notNull()
      .references(() => mediaFiles.id),
    streamIndex: integer().notNull(),
    codec: text().notNull(),
    language: text().notNull(),
    title: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.fileId, t.streamIndex] })],
);
export const subtitleTracks = sqliteTable(
  "subtitle_tracks",
  {
    fileId: text()
      .notNull()
      .references(() => mediaFiles.id),
    streamIndex: integer().notNull(),
    codec: text().notNull(),
    language: text().notNull(),
    title: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.fileId, t.streamIndex] })],
);
export const watchHistory = sqliteTable("watch_history", {
  id: text().primaryKey(),
  profileId: text()
    .notNull()
    .references(() => profiles.id),
  movieId: text()
    .notNull()
    .references(() => movies.id),
  completedAt: integer().notNull(),
});
export const transcodeJobs = sqliteTable("transcode_jobs", {
  sessionId: text()
    .primaryKey()
    .references(() => playbackSessions.id),
  status: text().notNull(),
  encoder: text().notNull(),
  quality: text().notNull(),
  startedAt: integer().notNull(),
  finishedAt: integer(),
  error: text(),
});
