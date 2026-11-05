export type Movie = {
  id: string;
  certification: string | null;
  trailers: { name: string; url: string }[];
  tmdbId: number | null;
  title: string;
  year: number | null;
  overview: string | null;
  genres: string[];
  cast: string[];
  director: string | null;
  rating: number | null;
  duration: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  container: string;
  poster: string | null;
  backdrop: string | null;
  available: boolean;
  review: boolean;
  addedAt: number;
  position: number;
  completed: boolean;
  watchlisted: boolean;
  collection: string | null;
  audioTracks: Track[];
  subtitles: Track[];
};
export type Track = {
  index: number;
  codec: string;
  language: string;
  title: string;
};
export type Profile = {
  id: string;
  name: string;
  avatar: string;
  child: boolean;
  locked: boolean;
};
export type Session = {
  user: { id: string; username: string };
  profileId: string | null;
  profiles: Profile[];
};
