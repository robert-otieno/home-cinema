import { TVShows, ShowDetails, TVShelf, TVContinue, TVReviewPanel } from "./TV";
import { useState, useEffect, lazy, Suspense, type FormEvent } from "react";
import {
  Routes,
  Route,
  Link,
  NavLink,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Play,
  Plus,
  Check,
  Search,
  Settings,
  ArrowLeft,
  ArrowRight,
  Film,
  FolderPlus,
  RefreshCw,
  Monitor,
  LogOut,
  Users,
  HardDrive,
  Clapperboard,
  Info,
  Shield,
  Wifi,
  ChevronRight,
  Heart,
  AlertCircle,
} from "lucide-react";
import type { Movie, Session } from "@cinema/shared";
import { api, post } from "./api";
const Player = lazy(() =>
  import("./Player").then((m) => ({ default: m.Player })),
);
function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        <Clapperboard size={21} />
      </span>
      HOME<span>CINEMA</span>
      <i>LOCAL</i>
    </Link>
  );
}
export function App() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api<{ setupRequired: boolean }>("/health"),
  });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Session>("/me"),
    enabled: health.data?.setupRequired === false,
    retry: false,
  });
  useEffect(() => {
    if (!me.data) return;
    const events = new EventSource("/api/events");
    events.onmessage = () => {
      void client.invalidateQueries({ queryKey: ["movies"] });
      void client.invalidateQueries({ queryKey: ["tv"] });
      void client.invalidateQueries({ queryKey: ["scans"] });
      void client.invalidateQueries({ queryKey: ["libraries"] });
    };
    return () => events.close();
  }, [!!me.data, client]);
  useEffect(() => {
    function remote(e: KeyboardEvent) {
      if (
        document.body.classList.contains("tv-mode") &&
        ["Escape", "Backspace", "BrowserBack"].includes(e.key) &&
        !(e.target as HTMLElement)?.matches("input,select,textarea")
      ) {
        if (document.fullscreenElement) return;
        e.preventDefault();
        navigate(-1);
        return;
      }
      if (
        !document.body.classList.contains("tv-mode") ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) ||
        (e.target as HTMLElement)?.matches("input,select,textarea,video")
      )
        return;
      const candidates = [
        ...document.querySelectorAll<HTMLElement>(
          'a,button,input,select,[tabindex="0"]',
        ),
      ].filter(
        (el) =>
          el.getClientRects().length && !(el as HTMLButtonElement).disabled,
      );
      const current = document.activeElement as HTMLElement;
      const rect = current?.getBoundingClientRect();
      if (!rect || current === document.body) {
        e.preventDefault();
        candidates[0]?.focus();
        return;
      }
      const cx = rect.x + rect.width / 2,
        cy = rect.y + rect.height / 2;
      let best: HTMLElement | undefined,
        score = Infinity;
      for (const el of candidates) {
        if (el === current) continue;
        const r = el.getBoundingClientRect(),
          dx = r.x + r.width / 2 - cx,
          dy = r.y + r.height / 2 - cy;
        const forward =
          e.key === "ArrowRight"
            ? dx
            : e.key === "ArrowLeft"
              ? -dx
              : e.key === "ArrowDown"
                ? dy
                : -dy;
        if (forward < 5) continue;
        const cross =
          e.key === "ArrowLeft" || e.key === "ArrowRight"
            ? Math.abs(dy)
            : Math.abs(dx);
        const distance = forward + cross * 3;
        if (distance < score) {
          score = distance;
          best = el;
        }
      }
      if (best) {
        e.preventDefault();
        best.focus();
        best.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
    document.addEventListener("keydown", remote);
    return () => document.removeEventListener("keydown", remote);
  }, []);
  if (health.isPending) return <Loading />;
  if (health.error)
    return (
      <div className="center">
        <AlertCircle />
        <h1>Server unavailable</h1>
        <p>{health.error.message}</p>
        <button onClick={() => health.refetch()}>Try again</button>
      </div>
    );
  if (health.data?.setupRequired) return <Auth setup />;
  if (me.isPending) return <Loading />;
  if (!me.data) return <Auth />;
  if (!me.data.profileId) return <Profiles session={me.data} />;
  return (
    <Routes>
      <Route
        path="/watch/:id"
        element={
          <Suspense fallback={<Loading />}>
            <Player />
          </Suspense>
        }
      />
      <Route path="*" element={<Shell session={me.data} />} />
    </Routes>
  );
}
function Loading() {
  return (
    <main className="loading">
      <Brand />
      <div className="skeleton hero-skeleton" />
      <div className="skeleton-row">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    </main>
  );
}
function Auth({ setup = false }: { setup?: boolean }) {
  const client = useQueryClient(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await post(setup ? "/setup" : "/login", {
        username: f.get("username"),
        password: f.get("password"),
      });
      await client.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <div className="auth-backdrop" aria-hidden="true" />
      <div className="auth-shade" aria-hidden="true" />
      <Brand />
      <form className="auth-card panel" onSubmit={submit}>
        <span className="small-label">
          {setup ? "WELCOME HOME" : "THE SCREEN IS YOURS"}
        </span>
        <h2>{setup ? "Set up your cinema" : "Welcome back"}</h2>
        <p>
          {setup
            ? "Create your household administrator account."
            : "Sign in to your local household account."}
        </p>
        <label>
          Username
          <input
            name="username"
            autoComplete="username"
            required
            minLength={2}
            maxLength={80}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            required
            minLength={12}
            maxLength={256}
          />
        </label>
        <span className="muted small">At least 12 characters.</span>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy
            ? "Opening the doors…"
            : setup
              ? "Create my cinema"
              : "Enter cinema"}
          <ArrowRight size={18} />
        </button>
        <div className="privacy">
          <Shield size={14} />
          Stored on your computer. No cloud account.
        </div>
      </form>
      <footer className="auth-credits">
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
          <img src="/tmdb.svg" alt="TMDB" width="70" />
        </a>
        <span>
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </span>
      </footer>
    </main>
  );
}
function Profiles({
  session,
  onDone,
}: {
  session: Session;
  onDone?: () => void;
}) {
  const client = useQueryClient(),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const profile = session.profiles.find((p) => p.id === selected);
  async function select(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await post("/profiles/" + selected + "/select", {
        pin: f.get("pin") || undefined,
        password: f.get("password") || undefined,
      });
      await client.invalidateQueries();
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="profile-page">
      <Brand />
      <div className="eyebrow">MAKE YOURSELF AT HOME</div>
      <h1>Who's watching?</h1>
      <p>Pick your own corner of the cinema.</p>
      <div className="profile-grid">
        {session.profiles.map((p) => (
          <button
            key={p.id}
            className={
              "profile-choice " + (selected === p.id ? "selected" : "")
            }
            onClick={() => setSelected(p.id)}
          >
            <span className={"avatar " + p.avatar}>
              <Users size={38} />
            </span>
            {p.name}
            <small>
              {p.child
                ? "Family profile"
                : p.locked
                  ? "PIN protected"
                  : "Household profile"}
            </small>
          </button>
        ))}
      </div>
      {profile && (
        <form className="profile-unlock" onSubmit={select}>
          {profile.locked ? (
            <label>
              Profile PIN
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                required
                pattern="[0-9]{4,8}"
                autoFocus
              />
            </label>
          ) : !profile.child ? (
            <label>
              Household password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
              />
            </label>
          ) : null}
          <button className="primary" disabled={busy}>
            Start watching
            <ArrowRight size={16} />
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
      {onDone && (
        <button className="ghost" onClick={onDone}>
          Cancel
        </button>
      )}
    </div>
  );
}
function Shell({ session }: { session: Session }) {
  const [switching, setSwitching] = useState(false),
    [tv, setTv] = useState(localStorage.getItem("cinema-tv") === "true");
  const navigate = useNavigate(),
    client = useQueryClient();
  useEffect(() => {
    document.body.classList.toggle("tv-mode", tv);
    localStorage.setItem("cinema-tv", String(tv));
  }, [tv]);
  if (switching)
    return <Profiles session={session} onDone={() => setSwitching(false)} />;
  const profile = session.profiles.find((p) => p.id === session.profileId);
  return (
    <>
      <header className="nav">
        <Brand />
        <nav>
          <NavLink to="/" end>
            Discover
          </NavLink>
          <NavLink to="/browse">Movies</NavLink>
          <NavLink to="/shows">TV Shows</NavLink>
          <NavLink to="/watchlist">My list</NavLink>
        </nav>
        <div className="nav-actions">
          <Link
            className="icon-button"
            to="/browse"
            aria-label="Search library"
          >
            <Search size={20} />
          </Link>
          <button
            className={"icon-button " + (tv ? "active" : "")}
            onClick={() => setTv(!tv)}
            title="Toggle TV navigation"
            aria-label="Toggle TV navigation"
          >
            <Monitor size={20} />
          </button>
          {!profile?.child && (
            <Link
              className="icon-button"
              to="/settings"
              aria-label="Cinema settings"
            >
              <Settings size={20} />
            </Link>
          )}
          <button
            className={"avatar mini " + profile?.avatar}
            onClick={() => setSwitching(true)}
            aria-label={"Switch profile, current " + profile?.name}
          >
            {profile?.name.slice(0, 1)}
          </button>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={async () => {
              await post("/logout");
              client.clear();
              navigate("/");
              location.reload();
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/shows" element={<TVShows />} />
        <Route path="/show/:id" element={<ShowDetails />} />
        <Route path="/watchlist" element={<Browse listed />} />
        <Route path="/movie/:id" element={<Details />} />
        <Route path="/settings" element={<Admin />} />
        <Route path="/about" element={<About />} />
        <Route
          path="*"
          element={
            <div className="center">
              <h1>That page is not here.</h1>
              <Link to="/">Back to cinema</Link>
            </div>
          }
        />
      </Routes>
      <footer className="site-footer">
        <Brand />
        <span>Your films. Your home. Your cinema.</span>
        <Link to="/about">About & credits</Link>
        <span className="online-dot">LOCAL & PERSONAL</span>
      </footer>
    </>
  );
}
function useMovies() {
  return useQuery({
    queryKey: ["movies", "home"],
    queryFn: () => api<{ items: Movie[]; total: number }>("/movies?limit=200"),
  });
}
function Empty({ listed = false }: { listed?: boolean }) {
  return (
    <section className="empty">
      <div className="empty-icon">{listed ? <Heart /> : <Film />}</div>
      <div className="eyebrow">
        {listed ? "SAVE SOMETHING GOOD" : "THE BEGINNING OF A GREAT COLLECTION"}
      </div>
      <h1>
        {listed
          ? "Your next movie night starts here."
          : "Every great cinema starts with a film."}
      </h1>
      <p>
        {listed
          ? "Add a film to My list from its detail page."
          : "Connect a folder of movies you own, and we’ll bring your collection to life. Your files stay exactly where they are."}
      </p>
      <Link className="primary" to={listed ? "/browse" : "/settings"}>
        {listed ? "Explore your movies" : "Connect a movie folder"}
        <ArrowRight size={18} />
      </Link>
      <div className="empty-features">
        <span>
          <HardDrive size={17} />
          Your local files
        </span>
        <span>
          <Shield size={17} />
          Private by design
        </span>
        <span>
          <Wifi size={17} />
          Ready for your home network
        </span>
      </div>
    </section>
  );
}
function Card({ movie }: { movie: Movie }) {
  return (
    <Link className="movie-card" to={"/movie/" + movie.id}>
      <div className="poster">
        {movie.poster ? (
          <img loading="lazy" src={movie.poster} alt={movie.title} />
        ) : (
          <div className="poster-fallback">
            <Film size={28} />
            <strong>{movie.title}</strong>
            <span>{movie.year || "YOUR COLLECTION"}</span>
          </div>
        )}
        <span className="card-play">
          <Play size={22} fill="currentColor" />
        </span>
        {!movie.available && (
          <span className="unavailable">File unavailable</span>
        )}
        {movie.position > 0 && !movie.completed && (
          <div className="card-progress">
            <i
              style={{
                width:
                  Math.min(
                    100,
                    (movie.position / (movie.duration || 1)) * 100,
                  ) + "%",
              }}
            />
          </div>
        )}
      </div>
      <h3>{movie.title}</h3>
      <p>
        {movie.year || "Local film"}
        <span>·</span>
        {movie.height >= 2160
          ? "4K"
          : movie.height >= 1080
            ? "1080p"
            : movie.height >= 720
              ? "720p"
              : "SD"}
      </p>
    </Link>
  );
}
function Shelf({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: Movie[];
}) {
  if (!items.length) return null;
  return (
    <section className="shelf">
      <div className="section-heading">
        <div>
          <span className="small-label">{subtitle}</span>
          <h2>
            {title}
            <span>{items.length}</span>
          </h2>
        </div>
        <Link to="/browse">
          Explore library
          <ChevronRight size={17} />
        </Link>
      </div>
      <div className="shelf-row">
        {items.map((movie) => (
          <Card key={movie.id} movie={movie} />
        ))}
      </div>
    </section>
  );
}
function Home() {
  const { data, isPending, error } = useMovies();
  if (isPending) return <Loading />;
  if (error) return <ErrorView error={error} />;
  const available = data!.items.filter((m) => m.available);
  if (!available.length) return <TVShows home />;
  const featured = available.find((m) => m.backdrop) || available[0],
    continued = available.filter((m) => m.position > 0 && !m.completed);
  const preferred = new Set(continued.flatMap((m) => m.genres));
  const recommended = [...available]
    .filter((m) => m.id !== featured.id && !m.completed)
    .sort(
      (a, b) =>
        b.genres.filter((g) => preferred.has(g)).length -
          a.genres.filter((g) => preferred.has(g)).length ||
        (b.rating || 0) - (a.rating || 0),
    );
  return (
    <main>
      <section
        className={"hero " + (!featured.backdrop ? "no-art" : "")}
        style={
          featured.backdrop
            ? { backgroundImage: "url(" + featured.backdrop + ")" }
            : {}
        }
      >
        <div className="hero-content">
          <div className="eyebrow">
            <span />
            TONIGHT, IN YOUR CINEMA
          </div>
          <h1>{featured.title}</h1>
          <div className="facts">
            <span>{featured.year}</span>
            {featured.rating && (
              <span className="rating">★ {featured.rating.toFixed(1)}</span>
            )}
            <span>{Math.round(featured.duration / 60)} min</span>
            <span className="badge">
              {featured.height >= 1080 ? "HD" : "LOCAL"}
            </span>
          </div>
          <p>
            {featured.overview ||
              "A film from your personal collection. Settle in, get comfortable, and make it a movie night."}
          </p>
          <div className="button-row">
            <Link className="primary" to={"/watch/" + featured.id}>
              <Play size={18} fill="currentColor" />
              {featured.position > 0 && !featured.completed
                ? "Resume watching"
                : "Play movie"}
            </Link>
            <Link className="secondary" to={"/movie/" + featured.id}>
              <Info size={19} />
              More information
            </Link>
          </div>
          <span className="hero-note">STREAMING FROM YOUR OWN COLLECTION</span>
        </div>
        <div className="hero-counter">
          <span>01</span> / YOUR LIBRARY
        </div>
      </section>
      <div className="home-shelves">
        <TVContinue />
        <TVShelf />
        <Shelf
          title="Pick up where you left off"
          subtitle="CONTINUE WATCHING"
          items={continued}
        />
        <Shelf
          title="Fresh to your collection"
          subtitle="RECENTLY ADDED"
          items={available.slice(0, 16)}
        />
        <Shelf
          title="A little something for you"
          subtitle="FROM YOUR LIBRARY"
          items={recommended.slice(0, 12)}
        />
        {[
          "Action",
          "Comedy",
          "Drama",
          "Science Fiction",
          "Horror",
          "Family",
        ].map((g) => (
          <Shelf
            key={g}
            title={g}
            items={available.filter((m) => m.genres.includes(g)).slice(0, 16)}
          />
        ))}
        <Shelf
          title="Your movie night shortlist"
          subtitle="MY LIST"
          items={available.filter((m) => m.watchlisted)}
        />
        {[...new Set(available.map((m) => m.collection).filter(Boolean))].map(
          (c) => (
            <Shelf
              key={c}
              title={c!}
              subtitle="COLLECTION"
              items={available.filter((m) => m.collection === c)}
            />
          ),
        )}
      </div>
    </main>
  );
}
function Browse({ listed = false }: { listed?: boolean }) {
  const [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(params.get("q") || "");
  useEffect(() => {
    const t = setTimeout(
      () =>
        setParams(
          (p) => {
            if (search) p.set("q", search);
            else p.delete("q");
            p.delete("offset");
            return p;
          },
          { replace: true },
        ),
      250,
    );
    return () => clearTimeout(t);
  }, [search, setParams]);
  const query = new URLSearchParams(params);
  query.set("limit", "60");
  if (listed) query.set("watchlist", "true");
  const { data, isPending, error } = useQuery({
    queryKey: ["movies", "browse", query.toString()],
    queryFn: () => api<{ items: Movie[]; total: number }>("/movies?" + query),
  });
  const all = useMovies();
  const years = [
    ...new Set(all.data?.items.map((m) => m.year).filter(Boolean) || []),
  ].sort((a, b) => b! - a!);
  const genres = [
    ...new Set(all.data?.items.flatMap((m) => m.genres) || []),
  ].sort();
  function filter(key: string, value: string) {
    setParams((p) => {
      value ? p.set(key, value) : p.delete(key);
      p.delete("offset");
      return p;
    });
  }
  return (
    <main className="page browse">
      {listed && <TVShelf listed />}
      <div className="eyebrow">
        {listed ? "FOR ANOTHER NIGHT" : "YOUR OWN FILM UNIVERSE"}
      </div>
      <h1>
        {listed ? "My list" : "The collection"}
        <span>{data?.total ?? "…"}</span>
      </h1>
      <p className="muted">
        {listed
          ? "Good films are even better when you have something to look forward to."
          : "Something for every mood. All right here at home."}
      </p>
      <div className="filters">
        <label className="search-box">
          <Search size={19} />
          <input
            aria-label="Search movies, people, genres or years"
            placeholder="Find a movie, a face, a feeling…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Genre"
          value={params.get("genre") || ""}
          onChange={(e) => filter("genre", e.target.value)}
        >
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select
          aria-label="Year"
          value={params.get("year") || ""}
          onChange={(e) => filter("year", e.target.value)}
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y!}>
              {y}
            </option>
          ))}
        </select>
        <select
          aria-label="Minimum rating"
          value={params.get("minRating") || ""}
          onChange={(e) => filter("minRating", e.target.value)}
        >
          <option value="">Any rating</option>
          <option value="6">6+ rating</option>
          <option value="7">7+ rating</option>
          <option value="8">8+ rating</option>
        </select>
        <select
          aria-label="Resolution"
          value={params.get("resolution") || ""}
          onChange={(e) => filter("resolution", e.target.value)}
        >
          <option value="">Any resolution</option>
          <option value="720">720p and above</option>
          <option value="1080">1080p and above</option>
          <option value="2160">4K</option>
        </select>
        <select
          aria-label="Sort"
          value={params.get("sort") || "recent"}
          onChange={(e) => filter("sort", e.target.value)}
        >
          <option value="recent">Recently added</option>
          <option value="title">Title A–Z</option>
          <option value="rating">Highest rated</option>
          <option value="year">Newest release</option>
        </select>
      </div>
      {error ? (
        <ErrorView error={error} />
      ) : isPending ? (
        <div className="skeleton-row">
          {[1, 2, 3, 4, 5].map((i) => (
            <div className="skeleton" key={i} />
          ))}
        </div>
      ) : !data?.items.length ? (
        listed && !search ? (
          <Empty listed />
        ) : (
          <div className="center">
            <Search />
            <h2>No films found</h2>
            <p>Try another title or adjust your filters.</p>
          </div>
        )
      ) : (
        <>
          <div className="movie-grid">
            {data.items.map((m) => (
              <Card key={m.id} movie={m} />
            ))}
          </div>
          <div className="pagination">
            <button
              disabled={!Number(params.get("offset"))}
              onClick={() =>
                filter(
                  "offset",
                  String(Math.max(0, Number(params.get("offset") || 0) - 60)),
                )
              }
            >
              Previous
            </button>
            <span>
              {Number(params.get("offset") || 0) + 1}–
              {Math.min(Number(params.get("offset") || 0) + 60, data.total)} of{" "}
              {data.total}
            </span>
            <button
              disabled={Number(params.get("offset") || 0) + 60 >= data.total}
              onClick={() => {
                setParams((p) => {
                  p.set("offset", String(Number(p.get("offset") || 0) + 60));
                  return p;
                });
              }}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
function Details() {
  const { id } = useParams(),
    client = useQueryClient();
  const {
    data: m,
    error,
    isPending,
  } = useQuery({
    queryKey: ["movies", id],
    queryFn: () => api<Movie>("/movies/" + id),
  });
  const all = useMovies();
  const list = useMutation({
    mutationFn: () =>
      post("/movies/" + id + "/watchlist", { enabled: !m?.watchlisted }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["movies"] }),
  });
  if (isPending) return <Loading />;
  if (error || !m)
    return <ErrorView error={error || new Error("Movie not found")} />;
  return (
    <main className="details">
      <div
        className="detail-backdrop"
        style={m.backdrop ? { backgroundImage: "url(" + m.backdrop + ")" } : {}}
      />
      <div className="detail-content">
        <Link className="back-link" to="/browse">
          <ArrowLeft size={18} />
          Back to collection
        </Link>
        <div className="detail-layout">
          <div className="detail-poster">
            {m.poster ? (
              <img src={m.poster} alt={m.title} />
            ) : (
              <div className="poster-fallback">
                <Film size={40} />
                <strong>{m.title}</strong>
              </div>
            )}
          </div>
          <div>
            <div className="eyebrow">IN YOUR COLLECTION</div>
            <h1>{m.title}</h1>
            <div className="facts">
              <span>{m.year}</span>
              <span>{Math.round(m.duration / 60)} min</span>
              {m.rating && (
                <span className="rating">★ {m.rating.toFixed(1)}</span>
              )}
              <span className="badge">
                {m.width} × {m.height}
              </span>
            </div>
            <div className="tags">
              {m.genres.map((g) => (
                <Link to={"/browse?genre=" + encodeURIComponent(g)} key={g}>
                  {g}
                </Link>
              ))}
            </div>
            <p className="synopsis">
              {m.overview ||
                "No synopsis has been added yet. You can match this film with TMDB in Cinema settings, or add your own description."}
            </p>
            <div className="button-row">
              {m.available ? (
                <Link className="primary" to={"/watch/" + id}>
                  <Play size={18} fill="currentColor" />
                  {m.position > 0 && !m.completed
                    ? "Resume at " + Math.floor(m.position / 60) + " min"
                    : "Play movie"}
                </Link>
              ) : (
                <span className="error">
                  <AlertCircle size={18} />
                  Source file unavailable
                </span>
              )}
              <button
                className="secondary"
                onClick={() => list.mutate()}
                disabled={list.isPending}
              >
                {m.watchlisted ? <Check size={18} /> : <Plus size={18} />}My
                list
              </button>
            </div>
            {list.error && <p className="error">{list.error.message}</p>}
            {m.trailers?.length > 0 && (
              <a
                className="back-link"
                href={m.trailers[0].url}
                target="_blank"
                rel="noreferrer"
              >
                Watch trailer
                <ArrowRight size={15} />
              </a>
            )}
            <div className="detail-meta">
              {m.director && (
                <p>
                  <span>Director</span>
                  {m.director}
                </p>
              )}
              {!!m.cast.length && (
                <p>
                  <span>Starring</span>
                  {m.cast.slice(0, 8).join(", ")}
                </p>
              )}
              <p>
                <span>Video</span>
                {m.videoCodec?.toUpperCase()} · {m.container?.toUpperCase()}
              </p>
              <p>
                <span>Audio</span>
                {m.audioTracks
                  .map((a) => a.title + " (" + a.codec + ")")
                  .join(", ") || "No audio track"}
              </p>
              <p>
                <span>Subtitles</span>
                {m.subtitles
                  .map((a) => a.language + " (" + a.codec + ")")
                  .join(", ") || "External subtitle files checked at playback"}
              </p>
            </div>
          </div>
        </div>
        <Shelf
          title="Keep the night going"
          subtitle="MORE FROM YOUR LIBRARY"
          items={(all.data?.items || [])
            .filter(
              (x) =>
                x.id !== id &&
                x.available &&
                x.genres.some((g) => m.genres.includes(g)),
            )
            .slice(0, 8)}
        />
        {m.tmdbId && (
          <p className="attribution">
            Metadata and images provided by TMDB. This product uses the TMDB API
            but is not endorsed or certified by TMDB.
          </p>
        )}
      </div>
    </main>
  );
}
export function ErrorView({ error }: { error: Error }) {
  return (
    <div className="center">
      <AlertCircle />
      <h2>Something needs attention</h2>
      <p className="error" role="alert">
        {error.message}
      </p>
      <button onClick={() => location.reload()}>Try again</button>
    </div>
  );
}
function Admin() {
  const [tab, setTab] = useState("library"),
    [error, setError] = useState(""),
    client = useQueryClient();
  const roots = useQuery({
    queryKey: ["libraries"],
    queryFn: () => api<any[]>("/libraries"),
  });
  const scans = useQuery({
    queryKey: ["scans"],
    queryFn: () => api<any[]>("/scans"),
    refetchInterval: 5000,
  });
  const system = useQuery({
    queryKey: ["system"],
    queryFn: () => api<any>("/system"),
    refetchInterval: 15000,
  });
  const preferences = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<any>("/settings"),
  });
  const connection = useQuery({
    queryKey: ["connection"],
    queryFn: () => api<any>("/connection"),
  });
  const library = useMovies();
  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await client.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    await act(async () => {
      await post("/libraries", {
        name: f.get("name"),
        path: f.get("path"),
        autoScan: f.get("auto") === "on",
        contentType: f.get("contentType") || "mixed",
      });
      form.reset();
    });
  }
  const s = system.data,
    bytes = (v: number) => ((v || 0) / 1024 ** 3).toFixed(1) + " GB";
  return (
    <main className="page admin">
      <div className="eyebrow">BEHIND THE SCENES</div>
      <h1>Cinema settings</h1>
      <p className="muted">A little housekeeping for a great movie night.</p>
      <div className="admin-layout">
        <aside>
          {[
            ["library", HardDrive, "Media library"],
            ["metadata", Film, "Movie information"],
            ["system", Monitor, "Server & playback"],
            ["profiles", Users, "Household profiles"],
            ["network", Wifi, "Connect a device"],
            ["preferences", Settings, "Preferences"],
          ].map(([key, Icon, title]: any) => (
            <button
              className={tab === key ? "selected" : ""}
              key={key}
              onClick={() => setTab(key)}
            >
              <Icon size={18} />
              {title}
              <ChevronRight size={15} />
            </button>
          ))}
        </aside>
        <div className="admin-main">
          {error && (
            <p className="error notice" role="alert">
              {error}
            </p>
          )}
          {(roots.error || system.error) && (
            <p className="error">
              {roots.error?.message || system.error?.message}
            </p>
          )}
          {tab === "library" && (
            <>
              <div className="stat-row">
                <Stat label="FILMS IN LIBRARY" value={s?.movieCount ?? "—"} />
                <Stat
                  label="MEDIA STORAGE"
                  value={s ? bytes(s.mediaBytes) : "—"}
                />
                <Stat
                  label="FREE ON DATA DRIVE"
                  value={s ? bytes(s.disk.free) : "—"}
                />
              </div>
              <section className="panel">
                <div className="section-heading">
                  <h2>Connected folders</h2>
                  <span className="badge">FILES STAY ON YOUR DRIVE</span>
                </div>
                {roots.data?.length ? (
                  roots.data.map((l) => (
                    <div className="library-root" key={l.id}>
                      <HardDrive size={23} />
                      <div>
                        <h3>{l.name}</h3>
                        <code>{l.path}</code>
                        <label className="library-kind">
                          <span className="sr-only">
                            Content type for {l.name}
                          </span>
                          <select
                            aria-label={"Content type for " + l.name}
                            value={l.contentType || "mixed"}
                            onChange={(e) =>
                              act(() =>
                                api("/libraries/" + l.id, {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    contentType: e.target.value,
                                  }),
                                }),
                              )
                            }
                          >
                            <option value="mixed">Mixed detection</option>
                            <option value="movies">Movies only</option>
                            <option value="tv">TV shows</option>
                          </select>
                        </label>
                        <p className={l.error ? "error" : "muted"}>
                          {l.error ||
                            "Last scan: " +
                              (l.lastScan
                                ? new Date(l.lastScan).toLocaleString()
                                : "Not scanned yet")}
                        </p>
                      </div>
                      <button
                        className="secondary"
                        onClick={() =>
                          act(() => post("/libraries/" + l.id + "/scan"))
                        }
                      >
                        <RefreshCw size={15} />
                        Scan
                      </button>
                      <button
                        className="ghost"
                        onClick={() =>
                          act(() =>
                            api("/libraries/" + l.id, {
                              method: "PATCH",
                              body: JSON.stringify({ autoScan: !l.autoScan }),
                            }),
                          )
                        }
                      >
                        {l.autoScan ? "Pause watching" : "Watch changes"}
                      </button>
                      <button
                        className="ghost danger"
                        onClick={() =>
                          act(() =>
                            api("/libraries/" + l.id, { method: "DELETE" }),
                          )
                        }
                      >
                        Disconnect
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    No folders connected. Add a dedicated media folder below.
                  </p>
                )}
                <form className="folder-form" onSubmit={add}>
                  <h3>
                    <FolderPlus size={18} />
                    Connect a folder
                  </h3>
                  <label>
                    Library name
                    <input
                      name="name"
                      placeholder="Movies"
                      required
                      maxLength={80}
                    />
                  </label>
                  <label>
                    Full folder path
                    <input
                      name="path"
                      placeholder="D:\Movies or /mnt/movies"
                      required
                    />
                  </label>
                  <label>
                    Folder content
                    <select name="contentType">
                      <option value="mixed">Mixed, detect movies and TV</option>
                      <option value="movies">Movies only</option>
                      <option value="tv">TV shows</option>
                    </select>
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" name="auto" defaultChecked />
                    Watch this folder for changes
                  </label>
                  <button className="primary">
                    Connect & scan
                    <ArrowRight size={16} />
                  </button>
                </form>
              </section>
              <TVReviewPanel />
              <section className="panel">
                <h2>Recent scans</h2>
                {!scans.data?.length && (
                  <p className="muted">Your scan history will appear here.</p>
                )}
                {scans.data?.map((job) => (
                  <div className="scan-job" key={job.id}>
                    <div>
                      <span className={"status " + job.status}>
                        {job.status.replaceAll("_", " ")}
                      </span>
                      <span>{job.processed} files processed</span>
                      <small>{new Date(job.startedAt).toLocaleString()}</small>
                    </div>
                    {job.errors?.length > 0 && (
                      <details>
                        <summary>{job.errors.length} warnings</summary>
                        {job.errors.map((e: string, i: number) => (
                          <p className="error small" key={i}>
                            {e}
                          </p>
                        ))}
                      </details>
                    )}
                  </div>
                ))}
              </section>
            </>
          )}
          {tab === "metadata" && (
            <section className="panel">
              <h2>Give every film its story</h2>
              <p className="muted">
                {s?.metadataConfigured
                  ? "TMDB is configured. Search and choose a match below."
                  : "To enable artwork and matching, set TMDB_TOKEN in the project .env file, then restart. Your library works without it."}
              </p>
              <MetadataEditor movies={library.data?.items || []} act={act} />
              <p className="attribution">
                <a
                  href="https://www.themoviedb.org/"
                  target="_blank"
                  rel="noreferrer"
                >
                  TMDB
                </a>{" "}
                provides metadata and artwork. This product uses the TMDB API
                but is not endorsed or certified by TMDB.
              </p>
            </section>
          )}
          {tab === "system" && (
            <>
              <div className="stat-row">
                <Stat
                  label="FFMPEG"
                  value={s?.ffmpeg ? "Available" : "Missing"}
                />
                <Stat
                  label="FFPROBE"
                  value={s?.ffprobe ? "Available" : "Missing"}
                />
                <Stat label="RAM FREE" value={s ? bytes(s.memory.free) : "—"} />
              </div>
              <section className="panel">
                <h2>Server health</h2>
                <dl>
                  <dt>CPU usage</dt>
                  <dd>{s?.cpuPercent ?? 0}%</dd>
                  <dt>Processor</dt>
                  <dd>{s?.cpu}</dd>
                  <dt>Encoders advertised by FFmpeg</dt>
                  <dd>{s?.encoders.join(", ") || "None detected"}</dd>
                  <dt>Encoding mode</dt>
                  <dd>
                    {s?.selectedEncoder || "Detecting…"}, with CPU fallback.
                    Self-tested hardware:{" "}
                    {s?.supportedHardware?.join(", ") || "none"}.
                  </dd>
                  <dt>Missing media files</dt>
                  <dd>{s?.missingFiles ?? 0}</dd>
                  <dt>System uptime</dt>
                  <dd>{Math.floor((s?.uptime || 0) / 3600)} hours</dd>
                </dl>
                <a className="secondary" href="/api/backup" download>
                  Download database export
                </a>
                <p className="small muted">
                  Exports include password hashes. Store them privately. See
                  README for a full offline backup and restore.
                </p>
              </section>
              <section className="panel">
                <h2>Playback sessions</h2>
                {!s?.sessions.length && (
                  <p className="muted">
                    The cinema is quiet. Active streams will appear here.
                  </p>
                )}
                {s?.sessions.map((p: any) => (
                  <div key={p.id} className="scan-job">
                    <b>
                      {p.mode} · {p.quality}
                    </b>
                    <span className="status">{p.status}</span>
                    <p className="muted small">{p.device}</p>
                    {p.error && <p className="error">{p.error}</p>}
                  </div>
                ))}
              </section>
            </>
          )}
          {tab === "profiles" && (
            <section className="panel">
              <ProfileManager act={act} />
              <h2>A seat for everyone</h2>
              <p className="muted">
                Profiles have separate watchlists and progress. Family profiles
                show only films certified G or PG. Unrated films stay hidden.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    f = new FormData(form);
                  await act(async () => {
                    await post("/profiles", {
                      name: f.get("name"),
                      avatar: f.get("avatar"),
                      child: f.get("child") === "on",
                      pin: f.get("pin") || undefined,
                    });
                    form.reset();
                  });
                }}
                className="stack"
              >
                <label>
                  Profile name
                  <input name="name" required maxLength={40} />
                </label>
                <label>
                  Avatar color
                  <select name="avatar">
                    <option value="blue">Ocean</option>
                    <option value="lime">Lime</option>
                    <option value="rose">Rose</option>
                    <option value="amber">Amber</option>
                  </select>
                </label>
                <label>
                  Optional PIN
                  <input
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4,8}"
                    placeholder="4 to 8 digits"
                  />
                </label>
                <label className="checkbox">
                  <input type="checkbox" name="child" />
                  Family profile
                </label>
                <button className="primary">
                  Add profile
                  <Plus size={16} />
                </button>
              </form>
            </section>
          )}
          {tab === "preferences" && (
            <section className="panel">
              <h2>Make it your cinema</h2>
              {preferences.data && (
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(() =>
                      api("/settings", {
                        method: "PUT",
                        body: JSON.stringify({
                          serverName: f.get("serverName"),
                          defaultQuality: f.get("defaultQuality"),
                          maxTranscodes: Number(f.get("maxTranscodes")),
                          transcodeCacheGb: Number(f.get("transcodeCacheGb")),
                          hardwareAcceleration: f.get("hardwareAcceleration"),
                        }),
                      }),
                    );
                  }}
                >
                  <label>
                    Server name
                    <input
                      name="serverName"
                      defaultValue={preferences.data.serverName}
                      maxLength={60}
                      required
                    />
                  </label>
                  <label>
                    Default playback quality
                    <select
                      name="defaultQuality"
                      defaultValue={preferences.data.defaultQuality}
                    >
                      <option value="auto">Auto</option>
                      <option value="original">Original</option>
                      <option value="1080p">1080p</option>
                      <option value="720p">720p</option>
                    </select>
                  </label>
                  <label>
                    Hardware acceleration
                    <select
                      name="hardwareAcceleration"
                      defaultValue={
                        preferences.data.hardwareAcceleration || "auto"
                      }
                    >
                      <option value="auto">
                        Auto, self-tested encoders with CPU fallback
                      </option>
                      <option value="cpu">CPU only</option>
                      <option value="h264_qsv">Intel Quick Sync</option>
                      <option value="h264_nvenc">NVIDIA NVENC</option>
                      <option value="h264_amf">AMD AMF</option>
                      <option value="h264_vaapi">Linux VA-API</option>
                    </select>
                  </label>
                  <label>
                    Maximum concurrent conversions
                    <input
                      name="maxTranscodes"
                      type="number"
                      min={1}
                      max={4}
                      defaultValue={preferences.data.maxTranscodes}
                    />
                  </label>
                  <label>
                    Temporary conversion cache limit (GB)
                    <input
                      name="transcodeCacheGb"
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={preferences.data.transcodeCacheGb}
                    />
                  </label>
                  <button className="primary">
                    Save preferences
                    <Check size={16} />
                  </button>
                  <p className="muted small">
                    Port, bind address, media tool paths, and TMDB credentials
                    are configured in .env. Restart after changing them.
                  </p>
                </form>
              )}
              <hr />
              <PasswordForm />
              <hr />
              <h3>Artwork housekeeping</h3>
              <button
                className="secondary"
                onClick={() => act(() => post("/cache/prune"))}
              >
                Remove unused cached artwork
              </button>
            </section>
          )}
          {tab === "network" && (
            <section className="panel connection">
              <Wifi size={32} />
              <h2>
                The big screen. The small screen.
                <br />
                Your screen.
              </h2>
              <p className="muted">
                On a device connected to the same home network, open one of
                these addresses.
              </p>
              {connection.data?.addresses.map((url: string) => (
                <a className="network-url" key={url} href={url}>
                  {url}
                </a>
              ))}
              {connection.data?.qr && (
                <img
                  className="qr"
                  src={connection.data.qr}
                  alt="QR code for your local cinema address"
                />
              )}
              <p className="small muted">
                If the connection fails, follow the Windows firewall
                instructions in README. Remote and physical TV playback have not
                been verified on your devices.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="small-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function MetadataEditor({
  movies,
  act,
}: {
  movies: Movie[];
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [id, setId] = useState(""),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<any[]>([]);
  const movie = movies.find((m) => m.id === id);
  return (
    <>
      <label>
        Movie
        <select
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setQuery(movies.find((m) => m.id === e.target.value)?.title || "");
            setResults([]);
          }}
        >
          <option value="">Choose a library movie</option>
          {movies.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
              {m.review ? " · needs review" : ""}
            </option>
          ))}
        </select>
      </label>
      {movie && (
        <>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () =>
                setResults(
                  await api("/metadata/search?q=" + encodeURIComponent(query)),
                ),
              );
            }}
          >
            <input
              value={query}
              aria-label="TMDB search"
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="secondary">
              <Search size={16} />
              Search TMDB
            </button>
          </form>
          <div>
            {results.slice(0, 8).map((r) => (
              <div className="metadata-result" key={r.id}>
                <span>
                  {r.title} ({r.release_date?.slice(0, 4)})
                </span>
                <button
                  onClick={() =>
                    act(() =>
                      post("/movies/" + id + "/match", { tmdbId: r.id }),
                    )
                  }
                >
                  Use this match
                </button>
              </div>
            ))}
          </div>
          <form
            key={movie.id}
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api("/movies/" + id, {
                  method: "PATCH",
                  body: JSON.stringify({
                    title: f.get("title"),
                    year: f.get("year") ? Number(f.get("year")) : null,
                    overview: f.get("overview"),
                    certification: f.get("certification") || null,
                  }),
                }),
              );
            }}
          >
            <h3>Or edit locally</h3>
            <label>
              Title
              <input name="title" defaultValue={movie.title} required />
            </label>
            <label>
              Year
              <input
                name="year"
                type="number"
                defaultValue={movie.year || ""}
                min={1880}
                max={2200}
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
            <label>
              Synopsis
              <textarea
                name="overview"
                rows={4}
                defaultValue={movie.overview || ""}
              />
            </label>
            <button className="primary">
              Save correction
              <Check size={16} />
            </button>
          </form>
        </>
      )}
    </>
  );
}

function About() {
  return (
    <main className="page">
      <div className="eyebrow">YOUR OWN LITTLE PICTURE HOUSE</div>
      <h1>Home Cinema</h1>
      <p className="muted">
        A private home for films you own. Your collection and viewing history
        stay on your server.
      </p>
      <section className="panel credits">
        <h2>Credits</h2>
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
          <img src="/tmdb.svg" alt="TMDB" width="95" />
        </a>
        <p>
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </p>
        <p className="muted small">
          Film information and licensed images are provided by TMDB when you
          enable the optional integration. Local playback uses FFmpeg, HLS.js,
          and your browser.
        </p>
        <p className="muted small">
          Built with React, Fastify, Vite, Drizzle, libSQL, Tailwind CSS,
          TanStack Query, React Router, Lucide, and other open source projects.
          Third party licenses are included in installed package distributions.
        </p>
      </section>
    </main>
  );
}

function ProfileManager({
  act,
}: {
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Session>("/me") });
  return (
    <div className="profile-management">
      <h2>Your household</h2>
      {me.data?.profiles.map((p) => (
        <form
          key={p.id}
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(() =>
              api("/profiles/" + p.id, {
                method: "PATCH",
                body: JSON.stringify({
                  name: f.get("name"),
                  avatar: f.get("avatar"),
                  child: f.get("child") === "on",
                  pin:
                    f.get("removePin") === "on"
                      ? null
                      : f.get("pin") || undefined,
                }),
              }),
            );
          }}
        >
          <label>
            Profile name
            <input name="name" defaultValue={p.name} required maxLength={40} />
          </label>
          <label>
            Avatar
            <select name="avatar" defaultValue={p.avatar}>
              {["lime", "blue", "rose", "amber"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            New PIN, leave blank to keep current
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,8}"
            />
          </label>
          {p.locked && (
            <label className="checkbox">
              <input name="removePin" type="checkbox" />
              Remove existing PIN
            </label>
          )}
          <label className="checkbox">
            <input
              name="child"
              type="checkbox"
              defaultChecked={p.child}
              disabled={p.id === me.data?.profileId}
            />
            Family profile
          </label>
          <div className="button-row">
            <button className="secondary">Save changes</button>
            {p.id !== me.data?.profileId && (
              <button
                type="button"
                className="ghost danger"
                onClick={() =>
                  act(() => api("/profiles/" + p.id, { method: "DELETE" }))
                }
              >
                Archive profile
              </button>
            )}
          </div>
        </form>
      ))}
    </div>
  );
}
function PasswordForm() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError("");
        setBusy(true);
        try {
          await post("/account/password", {
            currentPassword: f.get("currentPassword"),
            newPassword: f.get("newPassword"),
          });
          location.reload();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Household password</h3>
      <label>
        Current password
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        New password
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={256}
        />
      </label>
      <button className="secondary" disabled={busy}>
        Change password & sign out
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="small muted">
        Changing the household password signs out every device.
      </p>
    </form>
  );
}
