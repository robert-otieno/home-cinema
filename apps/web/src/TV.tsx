import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Play,
  Plus,
  Check,
  ArrowLeft,
  ArrowRight,
  Tv,
  Search,
  FolderPlus,
  AlertCircle,
} from "lucide-react";
import type { TVShow, TVShowDetails, TVEpisode, Session } from "@cinema/shared";
import { api, post } from "./api";
const code = (e: TVEpisode) =>
  "S" +
  String(e.seasonNumber).padStart(2, "0") +
  " · E" +
  String(e.episodeNumber).padStart(2, "0") +
  (e.episodeEnd !== e.episodeNumber
    ? "–" + String(e.episodeEnd).padStart(2, "0")
    : "");
function ShowCard({ show }: { show: TVShow }) {
  return (
    <Link className="movie-card" to={"/show/" + show.id}>
      <div className="poster">
        {show.poster ? (
          <img loading="lazy" src={show.poster} alt={show.title} />
        ) : (
          <div className="poster-fallback">
            <Tv size={30} />
            <strong>{show.title}</strong>
            <span>TV SERIES</span>
          </div>
        )}
        <span className="card-play">
          <Play size={22} fill="currentColor" />
        </span>
        {show.review && <span className="tv-review-badge">Review match</span>}
        {!show.availableCount && (
          <span className="unavailable">Files unavailable</span>
        )}
      </div>
      <h3>{show.title}</h3>
      <p>
        {show.year || "TV series"} · {show.seasonCount}{" "}
        {show.seasonCount === 1 ? "season" : "seasons"} · {show.episodeCount}{" "}
        episodes
      </p>
    </Link>
  );
}
export function TVShelf({ listed = false }: { listed?: boolean }) {
  const { data } = useQuery({
    queryKey: ["tv", listed ? "watchlist" : "shelf"],
    queryFn: () =>
      api<{ items: TVShow[] }>(
        "/series?limit=12" + (listed ? "&watchlist=true" : ""),
      ),
  });
  if (!data?.items.length) return null;
  return (
    <section className="shelf">
      <div className="section-heading">
        <div>
          <span className="small-label">
            {listed ? "MY TV LIST" : "YOUR SERIES"}
          </span>
          <h2>{listed ? "Shows for another night" : "One more episode"}</h2>
        </div>
        <Link to="/shows">
          Explore TV
          <ArrowRight size={16} />
        </Link>
      </div>
      <div className="shelf-row">
        {data.items.map((s) => (
          <ShowCard key={s.id} show={s} />
        ))}
      </div>
    </section>
  );
}
export function TVContinue() {
  const { data } = useQuery({
    queryKey: ["tv", "continue"],
    queryFn: () => api<{ items: TVEpisode[] }>("/series/continue"),
  });
  if (!data?.items.length) return null;
  return (
    <section className="shelf tv-continue">
      <div className="section-heading">
        <div>
          <span className="small-label">CONTINUE WATCHING</span>
          <h2>Back to your series</h2>
        </div>
      </div>
      <div className="tv-continue-row">
        {data.items.map((e) => (
          <Link key={e.id} to={"/watch/" + e.id} className="tv-resume-card">
            <div
              className="tv-resume-image"
              style={
                e.backdrop ? { backgroundImage: "url(" + e.backdrop + ")" } : {}
              }
            >
              <Play size={26} fill="currentColor" />
              <span className="card-progress">
                <i
                  style={{
                    width:
                      Math.min(100, (e.position / (e.duration || 1)) * 100) +
                      "%",
                  }}
                />
              </span>
            </div>
            <h3>{e.showTitle}</h3>
            <p>
              {code(e)} · {e.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
export function TVShows({ home = false }: { home?: boolean }) {
  const [params, setParams] = useSearchParams(),
    [q, setQ] = useState(params.get("q") || "");
  const page = Number(params.get("offset") || 0);
  const { data, isPending, error } = useQuery({
    queryKey: ["tv", "browse", q, page],
    queryFn: () =>
      api<{ items: TVShow[]; total: number }>(
        "/series?q=" + encodeURIComponent(q) + "&offset=" + page + "&limit=60",
      ),
  });
  return (
    <main className="page tv-page">
      <div className="eyebrow">
        {home ? "MAKE IT AN EPISODE NIGHT" : "SEASONS OF GOOD STORIES"}
      </div>
      <h1>
        TV shows<span className="tv-count">{data?.total ?? "…"}</span>
      </h1>
      <p className="muted">
        Your series, organized by season. Every episode streams from your own
        library.
      </p>
      <div className="filters">
        <label className="search-box">
          <Search size={19} />
          <input
            aria-label="Search TV shows"
            placeholder="Find a show, actor or genre…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setParams({});
            }}
          />
        </label>
      </div>
      <TVContinue />
      {error ? (
        <p className="error" role="alert">
          {error.message}
        </p>
      ) : isPending ? (
        <p className="muted">Opening your TV library…</p>
      ) : !data?.items.length ? (
        <section className="empty tv-empty">
          <Tv size={40} />
          <h2>{q ? "No shows found" : "Your next series starts here"}</h2>
          <p>
            Connect a TV folder in settings. Use names such as Show Name/Season
            01/Show Name S01E01.mkv.
          </p>
          <Link className="primary" to="/settings">
            <FolderPlus size={18} />
            Manage folders
          </Link>
        </section>
      ) : (
        <>
          <div className="movie-grid">
            {data.items.map((s) => (
              <ShowCard key={s.id} show={s} />
            ))}
          </div>
          <div className="pagination">
            <button
              disabled={!page}
              onClick={() =>
                setParams({ offset: String(Math.max(0, page - 60)) })
              }
            >
              Previous
            </button>
            <span>
              {page + 1}–{Math.min(page + 60, data.total)} of {data.total}
            </span>
            <button
              disabled={page + 60 >= data.total}
              onClick={() => setParams({ offset: String(page + 60) })}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
export function ShowDetails() {
  const { id } = useParams(),
    client = useQueryClient(),
    [params, setParams] = useSearchParams();
  const {
    data: show,
    error,
    isPending,
  } = useQuery({
    queryKey: ["tv", "show", id],
    queryFn: () => api<TVShowDetails>("/series/" + id),
  });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Session>("/me") });
  const list = useMutation({
    mutationFn: () =>
      post("/series/" + id + "/watchlist", { enabled: !show?.watchlisted }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["tv"] }),
  });
  if (isPending)
    return (
      <main className="page">
        <p className="muted">Opening your series…</p>
      </main>
    );
  if (error || !show)
    return (
      <main className="page">
        <p className="error" role="alert">
          {error?.message || "Show not found"}
        </p>
        <Link to="/shows">Back to TV shows</Link>
      </main>
    );
  const selected = Number(
      params.get("season") ??
        show.seasons.find((s) => s.number > 0)?.number ??
        show.seasons[0]?.number ??
        0,
    ),
    season = show.seasons.find((s) => s.number === selected) || show.seasons[0];
  const profile = me.data?.profiles.find((p) => p.id === me.data.profileId);
  return (
    <main className="details tv-details">
      <div
        className="detail-backdrop"
        style={
          show.backdrop ? { backgroundImage: "url(" + show.backdrop + ")" } : {}
        }
      />
      <div className="detail-content">
        <Link className="back-link" to="/shows">
          <ArrowLeft size={18} />
          Back to TV shows
        </Link>
        <div className="detail-layout">
          <div className="detail-poster">
            {show.poster ? (
              <img src={show.poster} alt={show.title} />
            ) : (
              <div className="poster-fallback">
                <Tv size={40} />
                <strong>{show.title}</strong>
              </div>
            )}
          </div>
          <div>
            <div className="eyebrow">YOUR SERIES</div>
            <h1>{show.title}</h1>
            <div className="facts">
              <span>{show.year}</span>
              <span>{show.seasons.length} seasons in your library</span>
              {show.rating != null && (
                <span className="rating">★ {show.rating.toFixed(1)}</span>
              )}
              {show.certification && (
                <span className="badge">{show.certification}</span>
              )}
            </div>
            <div className="tags">
              {show.genres.map((g) => (
                <span key={g}>{g}</span>
              ))}
            </div>
            <p className="synopsis">
              {show.overview ||
                "A series from your personal collection. Choose a season and settle into the next chapter."}
            </p>
            <div className="button-row">
              {show.resumeEpisode && (
                <Link
                  className="primary"
                  to={"/watch/" + show.resumeEpisode.id}
                >
                  <Play size={18} fill="currentColor" />
                  {show.resumeEpisode.position > 0 &&
                  !show.resumeEpisode.completed
                    ? "Resume"
                    : "Play"}{" "}
                  {code(show.resumeEpisode)}
                </Link>
              )}
              <button
                className="secondary"
                disabled={list.isPending}
                onClick={() => list.mutate()}
              >
                {show.watchlisted ? <Check size={18} /> : <Plus size={18} />}My
                list
              </button>
            </div>
            {list.error && <p className="error">{list.error.message}</p>}
            {!!show.cast.length && (
              <p className="muted small tv-cast">
                Starring: {show.cast.slice(0, 10).join(", ")}
              </p>
            )}
          </div>
        </div>
        <section className="tv-seasons">
          <div className="section-heading">
            <div>
              <span className="small-label">THE STORY SO FAR</span>
              <h2>Episodes</h2>
            </div>
            <label className="season-picker">
              <span className="sr-only">Season</span>
              <select
                aria-label="Season"
                value={season?.number ?? 0}
                onChange={(e) => setParams({ season: e.target.value })}
              >
                {show.seasons.map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.name} · {s.episodes.length}{" "}
                    {s.episodes.length === 1 ? "episode" : "episodes"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {season?.overview && <p className="muted">{season.overview}</p>}
          <div className="episode-list">
            {season?.episodes.map((e) => (
              <Link
                key={e.id}
                to={e.available ? "/watch/" + e.id : "#"}
                onClick={(event) => {
                  if (!e.available) event.preventDefault();
                }}
                aria-disabled={!e.available}
                className={
                  "episode-row " + (!e.available ? "episode-missing" : "")
                }
              >
                <div className="episode-number">
                  {String(e.episodeNumber).padStart(2, "0")}
                  {e.episodeEnd !== e.episodeNumber && "–" + e.episodeEnd}
                </div>
                <div
                  className="episode-thumb"
                  style={
                    e.backdrop
                      ? { backgroundImage: "url(" + e.backdrop + ")" }
                      : {}
                  }
                >
                  {e.available ? (
                    <Play size={23} fill="currentColor" />
                  ) : (
                    <AlertCircle size={22} />
                  )}
                  <span className="card-progress">
                    <i
                      style={{
                        width:
                          (e.completed
                            ? 100
                            : Math.min(
                                100,
                                (e.position / (e.duration || 1)) * 100,
                              )) + "%",
                      }}
                    />
                  </span>
                </div>
                <div className="episode-description">
                  <h3>
                    {e.title}
                    {e.completed && (
                      <span className="episode-watched">
                        <Check size={13} />
                        Watched
                      </span>
                    )}
                  </h3>
                  <p>
                    {e.overview ||
                      "Episode " + e.episodeNumber + " of " + show.title}
                  </p>
                  <small>
                    {e.available
                      ? (e.position > 0 && !e.completed
                          ? "Resume at " +
                            Math.floor(e.position / 60) +
                            " min · "
                          : "") +
                        Math.max(1, Math.round(e.duration / 60)) +
                        " min"
                      : "Source file unavailable"}
                  </small>
                </div>
                <ArrowRight size={18} />
              </Link>
            ))}
          </div>
        </section>
        {!profile?.child && <ShowEditor show={show} />}
      </div>
    </main>
  );
}
function ShowEditor({ show }: { show: TVShowDetails }) {
  const client = useQueryClient(),
    [open, setOpen] = useState(show.review),
    [query, setQuery] = useState(show.title),
    [results, setResults] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["tv"] });
      await client.invalidateQueries({ queryKey: ["movies"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel tv-editor">
      <button className="ghost" onClick={() => setOpen(!open)}>
        {show.review ? "Review show information" : "Manage show information"}
      </button>
      {open && (
        <>
          <h2>Match this series</h2>
          <p className="muted small">
            Only episodes with local files are shown. Choose the correct TV
            match to add posters, season information, and episode names.
          </p>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () =>
                setResults(
                  await api("/tv/search?q=" + encodeURIComponent(query)),
                ),
              );
            }}
          >
            <input
              aria-label="TV metadata search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button disabled={busy} className="secondary">
              Search TMDB TV
            </button>
          </form>
          {results.slice(0, 8).map((r) => (
            <div className="metadata-result" key={r.id}>
              <span>
                {r.name} ({r.first_air_date?.slice(0, 4)})
              </span>
              <button
                disabled={busy}
                onClick={() =>
                  act(() =>
                    post("/series/" + show.id + "/match", { tmdbId: r.id }),
                  )
                }
              >
                Use this show
              </button>
            </div>
          ))}
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api("/series/" + show.id, {
                  method: "PATCH",
                  body: JSON.stringify({
                    title: f.get("title"),
                    overview: f.get("overview"),
                    certification: f.get("certification") || null,
                  }),
                }),
              );
            }}
          >
            <h3>Local corrections</h3>
            <label>
              Show title
              <input name="title" defaultValue={show.title} required />
            </label>
            <label>
              Synopsis
              <textarea name="overview" defaultValue={show.overview || ""} />
            </label>
            <label>
              Content certification
              <select
                name="certification"
                defaultValue={show.certification || ""}
              >
                <option value="">Unrated</option>
                {[
                  "TV-Y",
                  "TV-Y7",
                  "TV-Y7-FV",
                  "TV-G",
                  "TV-PG",
                  "TV-14",
                  "TV-MA",
                  "G",
                  "PG",
                  "NR",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={busy}>
              Save show corrections
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
export function TVReviewPanel() {
  const shows = useQuery({
    queryKey: ["tv", "organize-options"],
    queryFn: () => api<{ items: TVShow[] }>("/series?limit=100"),
  });
  const client = useQueryClient(),
    [error, setError] = useState("");
  const { data } = useQuery({
    queryKey: ["tv", "review"],
    queryFn: () =>
      api<{ id: string; title: string; filename: string }[]>("/tv/review"),
  });
  async function organize(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    try {
      const selected = shows.data?.items.find(
        (s) => s.id === f.get("seriesId"),
      );
      await post("/episodes/" + id + "/organize", {
        seriesId: selected?.id,
        showTitle: selected?.title || f.get("showTitle"),
        year: selected?.year || (f.get("year") ? Number(f.get("year")) : null),
        season: Number(f.get("season")),
        episode: Number(f.get("episode")),
      });
      await client.invalidateQueries({ queryKey: ["tv"] });
      await client.invalidateQueries({ queryKey: ["movies"] });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel">
      <h2>TV organization</h2>
      <p className="muted">
        Choose TV shows or Mixed detection on each folder, then scan. Recognized
        episodes are grouped automatically. Shows needing a TMDB match can be
        corrected from their show page.
      </p>
      <Link className="secondary" to="/shows">
        Open TV library
        <ArrowRight size={16} />
      </Link>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data?.map((item, i) => (
        <form
          key={item.id + "-" + i}
          className="tv-organize-form"
          onSubmit={(e) => organize(e, item.id)}
        >
          <h3>{item.filename}</h3>
          <label>
            Existing show
            <select name="seriesId">
              <option value="">Create a new show</option>
              {shows.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.year || "year unknown"})
                </option>
              ))}
            </select>
          </label>
          <label>
            Year (new show)
            <input name="year" type="number" min={1880} max={2200} />
          </label>
          <label>
            Show name
            <input name="showTitle" placeholder="For a new show" />
          </label>
          <label>
            Season
            <input name="season" type="number" min={0} max={999} required />
          </label>
          <label>
            Episode
            <input name="episode" type="number" min={1} max={9999} required />
          </label>
          <button className="primary">Organize episode</button>
        </form>
      ))}
    </section>
  );
}
