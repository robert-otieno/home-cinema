import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Hls from "hls.js";
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
  Loader2,
  Settings,
} from "lucide-react";
import type { Movie } from "@cinema/shared";
import { api, post } from "./api";
const clock = (n: number) => {
  if (!Number.isFinite(n)) return "0:00";
  const h = Math.floor(n / 3600),
    m = Math.floor((n % 3600) / 60),
    s = Math.floor(n % 60);
  return (
    (h ? h + ":" + String(m).padStart(2, "0") : m) +
    ":" +
    String(s).padStart(2, "0")
  );
};
export function Player() {
  const { id } = useParams(),
    video = useRef<HTMLVideoElement>(null),
    container = useRef<HTMLDivElement>(null),
    session = useRef<string | null>(null),
    position = useRef(0),
    lastSaved = useRef(0);
  const [quality, setQuality] = useState<string | null>(null),
    [audio, setAudio] = useState<number | undefined>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [volume, setVolume] = useState(1),
    [show, setShow] = useState(true),
    [menu, setMenu] = useState(false),
    [subtitle, setSubtitle] = useState(""),
    [mode, setMode] = useState(""),
    [ready, setReady] = useState(false);
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: () => api<{ defaultQuality: string }>("/preferences"),
  });
  useEffect(() => {
    if (!quality && preferences.data)
      setQuality(preferences.data.defaultQuality);
  }, [preferences.data, quality]);
  const movie = useQuery({
    queryKey: ["movies", id],
    queryFn: () => api<Movie>("/movies/" + id),
  });
  const subtitles = useQuery({
    queryKey: ["subtitles", id],
    queryFn: () => api<any[]>("/movies/" + id + "/subtitles"),
  });
  useEffect(() => {
    if (movie.error || preferences.error) {
      setError((movie.error || preferences.error)!.message);
      setBusy(false);
    }
  }, [movie.error, preferences.error]);
  const save = () => {
    const p = position.current;
    if (p < 0) return;
    void api("/movies/" + id + "/progress", {
      method: "PUT",
      body: JSON.stringify({ position: p }),
      keepalive: true,
    }).catch(() => {});
  };
  useEffect(() => {
    if (!movie.data || !quality) return;
    let disposed = false,
      hls: Hls | undefined,
      playbackId: string | undefined;
    const element = video.current!;
    const resume =
      position.current || (!movie.data!.completed ? movie.data!.position : 0);
    setBusy(true);
    setReady(false);
    setError("");
    async function start() {
      try {
        const stream = await post("/movies/" + id + "/play", {
          quality,
          audio,
        });
        playbackId = stream.id;
        if (disposed) {
          void api("/playback/" + stream.id, { method: "DELETE" }).catch(
            () => {},
          );
          return;
        }
        session.current = stream.id;
        setMode(stream.mode);

        function loaded() {
          if (disposed) return;
          setError("");
          if (resume > 0) element.currentTime = resume;
          setDuration(movie.data!.duration || element.duration);
          setReady(true);
          setBusy(false);
          void element.play().catch(() => {
            setPlaying(false);
            setShow(true);
          });
        }
        element.addEventListener("loadedmetadata", loaded, { once: true });
        if (stream.mode === "direct") element.src = stream.url;
        else if (Hls.isSupported()) {
          hls = new Hls({
            startPosition: resume,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            enableWorker: true,
          });
          hls.loadSource(stream.url);
          hls.attachMedia(element);
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal && !disposed) {
              setBusy(false);
              setError(
                "The compatibility stream could not play. Try another quality or check the server diagnostics.",
              );
            }
          });
        } else if (element.canPlayType("application/vnd.apple.mpegurl"))
          element.src = stream.url;
        else
          throw new Error(
            "This browser does not support HLS. Try Original with compatible MP4 media, or a current browser.",
          );
        return () => element.removeEventListener("loadedmetadata", loaded);
      } catch (e) {
        if (!disposed) {
          setBusy(false);
          setError((e as Error).message);
        }
      }
    }
    let remove: (() => void) | undefined;
    void start().then((fn) => {
      remove = fn;
    });
    const heartbeat = setInterval(() => {
      if (session.current)
        void post("/playback/" + session.current + "/heartbeat").catch(
          () => {},
        );
    }, 20000);
    return () => {
      disposed = true;
      clearInterval(heartbeat);
      remove?.();
      save();
      hls?.destroy();
      element.pause();
      element.removeAttribute("src");
      element.load();
      if (playbackId)
        void api("/playback/" + playbackId, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {});
      session.current = null;
    };
  }, [id, movie.data?.id, quality, audio]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function wake() {
      setShow(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!video.current?.paused && !menu) setShow(false);
      }, 3500);
    }
    function keyboard(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if ((e.target as HTMLElement)?.matches("input,select,button")) return;
      const v = video.current;
      if (!v) return;
      wake();
      if (
        [
          " ",
          "k",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "f",
          "m",
        ].includes(e.key)
      )
        e.preventDefault();
      if (e.key === " " || e.key === "k")
        v.paused ? void v.play().catch(() => {}) : v.pause();
      if (e.key === "ArrowLeft")
        v.currentTime = Math.max(0, v.currentTime - 10);
      if (e.key === "ArrowRight")
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
      if (e.key === "ArrowUp") v.volume = Math.min(1, v.volume + 0.1);
      if (e.key === "ArrowDown") v.volume = Math.max(0, v.volume - 0.1);
      if (e.key === "m") v.muted = !v.muted;
      if (e.key === "f")
        void container.current?.requestFullscreen?.().catch(() => {});
    }
    document.addEventListener("keydown", keyboard);
    container.current?.addEventListener("pointermove", wake);
    wake();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", keyboard);
      container.current?.removeEventListener("pointermove", wake);
    };
  }, [menu]);
  useEffect(() => {
    function leaving() {
      save();
    }
    window.addEventListener("pagehide", leaving);
    return () => window.removeEventListener("pagehide", leaving);
  }, [id]);
  const seek = (n: number) => {
    if (video.current)
      video.current.currentTime = Math.max(
        0,
        Math.min(video.current.duration || duration, n),
      );
  };
  const toggle = () => {
    const v = video.current;
    if (v) v.paused ? void v.play().catch(() => {}) : v.pause();
  };
  return (
    <div
      ref={container}
      className={
        "player " + (show || !playing || menu ? "controls-visible" : "")
      }
      onClick={() => setShow(true)}
    >
      <video
        ref={video}
        playsInline
        crossOrigin="use-credentials"
        onClick={toggle}
        onTimeUpdate={() => {
          const v = video.current!;
          if (v.readyState === 0) return;
          position.current = v.currentTime;
          setTime(v.currentTime);
          if (Date.now() - lastSaved.current > 10000) {
            save();
            lastSaved.current = Date.now();
          }
        }}
        onPlaying={() => {
          setPlaying(true);
          setBusy(false);
        }}
        onPause={() => {
          setPlaying(false);
          save();
        }}
        onWaiting={() => setBusy(true)}
        onCanPlay={() => setBusy(false)}
        onSeeked={save}
        onEnded={() => {
          setPlaying(false);
          save();
          setShow(true);
        }}
        onVolumeChange={() =>
          setVolume(video.current?.muted ? 0 : video.current?.volume || 0)
        }
        onError={() => {
          if (
            video.current?.getAttribute("src") &&
            !video.current.getAttribute("src")?.startsWith("blob:")
          ) {
            setBusy(false);
            setError(
              "This file cannot be played in its original format. Select 720p or 1080p for compatibility conversion.",
            );
          }
        }}
      >
        {subtitle && (
          <track
            key={subtitle}
            kind="subtitles"
            src={"/api/movies/" + id + "/subtitles/" + subtitle}
            srcLang="en"
            label="Selected subtitles"
            default
          />
        )}
      </video>
      <div className="player-top">
        <Link className="back-link" to={"/movie/" + id}>
          <ArrowLeft />
          Back to film
        </Link>
        <div>
          <span className="small-label">NOW SHOWING</span>
          <h1>{movie.data?.title || "Opening your film…"}</h1>
        </div>
        <span className="badge">{mode.toUpperCase()}</span>
      </div>
      {busy && !error && (
        <div className="player-message">
          <Loader2 className="spin" size={36} />
          <p>{ready ? "Buffering…" : "Preparing your movie…"}</p>
        </div>
      )}
      {error && (
        <div className="player-message panel">
          <h2>Let’s get this playing.</h2>
          <p role="alert">{error}</p>
          <div className="button-row">
            <button
              className="primary"
              onClick={() => {
                if (quality === "720p") setQuality("1080p");
                else setQuality("720p");
              }}
            >
              Try compatibility playback
            </button>
            <Link className="secondary" to={"/movie/" + id}>
              Back to film
            </Link>
          </div>
        </div>
      )}
      {menu && (
        <div className="player-settings panel">
          <h3>Make yourself comfortable</h3>
          <label>
            Quality
            <select
              value={quality || "auto"}
              onChange={(e) => {
                save();
                setQuality(e.target.value);
              }}
            >
              <option value="auto">Auto</option>
              <option value="original">Original, Direct Play</option>
              <option value="1080p">1080p, H.264 / AAC</option>
              <option value="720p">720p, H.264 / AAC</option>
            </select>
          </label>
          <label>
            Audio
            <select
              value={audio ?? ""}
              onChange={(e) => {
                save();
                setAudio(
                  e.target.value === "" ? undefined : Number(e.target.value),
                );
              }}
            >
              <option value="">Default track</option>
              {movie.data?.audioTracks.map((t) => (
                <option key={t.index} value={t.index}>
                  {t.title} · {t.language} · {t.codec}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subtitles
            <select
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
            >
              <option value="">Off</option>
              {subtitles.data?.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          {subtitles.error && (
            <p className="small error">{subtitles.error.message}</p>
          )}
          <label>
            Playback speed
            <select
              defaultValue="1"
              onChange={(e) => {
                if (video.current)
                  video.current.playbackRate = Number(e.target.value);
              }}
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={() => setMenu(false)}>
            Done
          </button>
        </div>
      )}
      <div className="player-bottom">
        <label className="scrubber">
          <span className="sr-only">Playback position</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={Math.min(time, duration || 1)}
            onChange={(e) => seek(Number(e.target.value))}
          />
        </label>
        <div className="player-buttons">
          <button aria-label={playing ? "Pause" : "Play"} onClick={toggle}>
            {playing ? <Pause /> : <Play fill="currentColor" />}
          </button>
          <button aria-label="Back 10 seconds" onClick={() => seek(time - 10)}>
            <SkipBack />
          </button>
          <button
            aria-label="Forward 10 seconds"
            onClick={() => seek(time + 10)}
          >
            <SkipForward />
          </button>
          <span className="player-time">
            {clock(time)}
            <span> / {clock(duration)}</span>
          </span>
          <div className="player-spacer" />
          <button
            aria-label={volume ? "Mute" : "Unmute"}
            onClick={() => {
              if (video.current) video.current.muted = !video.current.muted;
            }}
          >
            {volume ? <Volume2 /> : <VolumeX />}
          </button>
          <input
            className="volume"
            aria-label="Volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              if (video.current) {
                video.current.muted = false;
                video.current.volume = Number(e.target.value);
              }
            }}
          />
          <button
            aria-label="Playback settings"
            onClick={() => {
              setMenu(!menu);
              setShow(true);
            }}
          >
            <Settings />
          </button>
          <button
            aria-label="Fullscreen"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void container.current?.requestFullscreen?.().catch(() => {});
            }}
          >
            <Maximize />
          </button>
        </div>
        <span className="player-help">
          SPACE TO PAUSE · ← → TO SEEK · F FOR FULLSCREEN
        </span>
      </div>
    </div>
  );
}
