import { useNavigate } from "react-router-dom";
import { RemoveCatalogEntry } from "./CatalogCleanup";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Check, AlertCircle } from "lucide-react";
import type { Movie, Session } from "@cinema/shared";
import { api, post } from "./api";
export function MovieReview({ movie }: { movie: Movie }) {
  const navigate = useNavigate();
  const client = useQueryClient(),
    [open, setOpen] = useState(movie.review),
    [query, setQuery] = useState(movie.title),
    [year, setYear] = useState(movie.year ? String(movie.year) : ""),
    [results, setResults] = useState<any[] | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Session>("/me") });
  const profile = me.data?.profiles.find((p) => p.id === me.data.profileId);
  if (!profile || profile.child || movie.mediaType !== "movie") return null;
  async function act(action: () => Promise<unknown>, message = "") {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["movies"] });
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel movie-review">
      <button
        type="button"
        className="ghost"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {movie.review ? (
          <>
            <AlertCircle size={17} />
            Review / match movie
          </>
        ) : (
          "Manage movie information"
        )}
      </button>
      {notice && (
        <p className="movie-review-success" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      {open && (
        <>
          <h2>
            {movie.review ? "Find the correct film" : "Match movie information"}
          </h2>
          <p className="muted small">
            If automatic matching did not identify this film, edit the search
            title and choose the correct release. Your video file and watch
            progress stay in place.
          </p>
          <form
            className="movie-match-search"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () =>
                setResults(
                  await api(
                    "/metadata/search?q=" +
                      encodeURIComponent(query.trim()) +
                      (year ? "&year=" + encodeURIComponent(year) : ""),
                  ),
                ),
              );
            }}
          >
            <label>
              Movie title
              <input
                aria-label="Movie match title"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
                maxLength={200}
              />
            </label>
            <label>
              Year (optional)
              <input
                aria-label="Movie match year"
                type="number"
                min={1880}
                max={2200}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </label>
            <button className="secondary" disabled={busy}>
              <Search size={16} />
              {busy ? "Working…" : "Search TMDB"}
            </button>
          </form>
          {results && (
            <div className="movie-match-results">
              {!results.length && (
                <p className="muted" role="status">
                  No matches found. Try a shorter title or clear the year.
                </p>
              )}
              {results.slice(0, 12).map((r) => (
                <article key={r.id}>
                  <div>
                    <h3>
                      {r.title}
                      <span>
                        {r.release_date?.slice(0, 4) || "Year unknown"}
                      </span>
                    </h3>
                    <p>{r.overview || "No synopsis available."}</p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await post("/movies/" + movie.id + "/match", {
                          tmdbId: r.id,
                        });
                        setOpen(false);
                      }, "Movie information and artwork updated.")
                    }
                  >
                    Use this match
                  </button>
                </article>
              ))}
            </div>
          )}
          <details className="movie-local-corrections">
            <summary>Or edit movie information locally</summary>
            <form
              key={movie.id + movie.title + movie.year}
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(
                  () =>
                    api("/movies/" + movie.id, {
                      method: "PATCH",
                      body: JSON.stringify({
                        title: f.get("title"),
                        year: f.get("year") ? Number(f.get("year")) : null,
                        overview: f.get("overview"),
                        certification: f.get("certification") || null,
                      }),
                    }),
                  "Local movie corrections saved.",
                );
              }}
            >
              <label>
                Title
                <input
                  name="title"
                  defaultValue={movie.title}
                  required
                  maxLength={200}
                />
              </label>
              <label>
                Release year
                <input
                  name="year"
                  type="number"
                  min={1880}
                  max={2200}
                  defaultValue={movie.year || ""}
                />
              </label>
              <label>
                Synopsis
                <textarea
                  name="overview"
                  rows={4}
                  defaultValue={movie.overview || ""}
                />
              </label>
              <label>
                Content certification
                <select
                  name="certification"
                  defaultValue={movie.certification || ""}
                >
                  <option value="">Unrated</option>
                  {["G", "PG", "PG-13", "R", "NC-17", "NR"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <button className="primary" disabled={busy}>
                Save local corrections
              </button>
            </form>
          </details>
        </>
      )}
      <RemoveCatalogEntry
        ids={[movie.id]}
        label="Remove from library"
        onRemoved={() => navigate("/browse")}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
