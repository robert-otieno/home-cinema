import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Search } from "lucide-react";
import { api, post } from "./api";

export function RemoveCatalogEntry({
  ids,
  label,
  missingOnly = false,
  onRemoved,
}: {
  ids: string[];
  label: string;
  missingOnly?: boolean;
  onRemoved?: () => void;
}) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const client = useQueryClient();
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await post("/catalog/remove", { ids, missingOnly, confirm: true });
      setConfirm(false);
      onRemoved?.();
      await Promise.all(
        ["catalog", "movies", "tv", "system"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalog-remove">
      {!confirm ? (
        <button
          type="button"
          className="ghost danger"
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={16} aria-hidden="true" />
          {label}
        </button>
      ) : (
        <div
          className="catalog-confirm"
          role="group"
          aria-label="Confirm library removal"
        >
          <p>
            Remove {ids.length === 1 ? "this entry" : ids.length + " entries"}{" "}
            from the library?
          </p>
          <p className="muted small">
            Video files stay on disk. This removes their library records,
            progress and list memberships for all profiles. These paths will be
            excluded from future scans until you allow re-import.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="secondary danger"
              disabled={busy}
              onClick={remove}
            >
              {busy ? "Removing..." : "Remove from library"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => {
                setConfirm(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
type Entry = {
  id: string;
  title: string;
  year: number | null;
  mediaType: string;
  missing: boolean;
  episode: { show: string; season: number; episode: number } | null;
  files: { name: string; path: string; available: boolean }[];
};
export function CatalogCleanup() {
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [missing, setMissing] = useState(true),
    [offset, setOffset] = useState(0),
    [notice, setNotice] = useState(""),
    [allow, setAllow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const client = useQueryClient();
  const listing = useQuery({
    queryKey: ["catalog", query, missing, offset],
    queryFn: () =>
      api<{ items: Entry[]; total: number; excluded: number }>(
        "/catalog/entries?q=" +
          encodeURIComponent(query) +
          "&missing=" +
          missing +
          "&offset=" +
          offset,
      ),
  });
  async function reimport() {
    setBusy(true);
    setError("");
    try {
      await post("/catalog/allow-reimport", { confirm: true });
      setAllow(false);
      setNotice(
        "Removed paths can be imported again. Scan your folders to add files that still exist. Previous viewing history will not be restored.",
      );
      await client.invalidateQueries({ queryKey: ["catalog"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const items = listing.data?.items || [];
  return (
    <section className="panel catalog-cleanup">
      <h2>Library cleanup</h2>
      <p className="muted">
        Remove duplicate entries or clear films and episodes whose files have
        been deleted. Scan the connected folder first to update missing-file
        status.
      </p>
      <form
        className="catalog-search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(draft.trim());
          setOffset(0);
          setNotice("");
        }}
      >
        <label>
          Find an entry
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Movie or show title"
            maxLength={200}
          />
        </label>
        <button className="secondary">
          <Search size={16} aria-hidden="true" />
          Search
        </button>
      </form>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={missing}
          onChange={(e) => {
            setMissing(e.target.checked);
            setOffset(0);
            setNotice("");
          }}
        />
        Only entries with no available files
      </label>
      <p className="muted small">
        Uncheck this to find and remove a duplicate that is still available.
      </p>
      {listing.isPending ? (
        <p className="muted" role="status">
          Checking the catalog...
        </p>
      ) : listing.error ? (
        <p className="error" role="alert">
          {listing.error.message}
        </p>
      ) : (
        <>
          <p className="muted small">
            {listing.data?.total} matching{" "}
            {listing.data?.total === 1 ? "entry" : "entries"}
          </p>
          {!items.length && (
            <p className="muted">
              {missing
                ? "No missing entries match this search."
                : "No entries match this search."}
            </p>
          )}
          <div className="catalog-entries">
            {items.map((item) => (
              <article className="catalog-entry" key={item.id}>
                <div>
                  <h3>
                    {item.title}
                    {item.year ? " (" + item.year + ")" : ""}
                  </h3>
                  {item.episode && (
                    <p className="small">
                      {item.episode.show} - Season {item.episode.season},
                      episode {item.episode.episode}
                    </p>
                  )}
                  <span className="badge">
                    {item.missing
                      ? "No available files"
                      : item.mediaType === "episode"
                        ? "TV episode"
                        : "Movie"}
                  </span>
                  {item.files.map((f) => (
                    <p key={f.path} className="catalog-file">
                      <code>{f.path}</code>
                    </p>
                  ))}
                  {!item.files.length && (
                    <p className="muted small">No linked file records.</p>
                  )}
                </div>
                <RemoveCatalogEntry
                  ids={[item.id]}
                  label="Remove entry"
                  onRemoved={() =>
                    setNotice("Entry removed. Files on disk were kept.")
                  }
                />
              </article>
            ))}
          </div>
          {missing && items.length > 1 && (
            <RemoveCatalogEntry
              key={items.map((i) => i.id).join(",")}
              ids={items.map((i) => i.id)}
              missingOnly
              label={"Clear these " + items.length + " missing entries"}
              onRemoved={() =>
                setNotice("Missing entries cleared. Files on disk were kept.")
              }
            />
          )}
          {(listing.data?.total || 0) > 50 && (
            <div className="pagination">
              <button
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous
              </button>
              <span>
                {offset + 1}-{offset + items.length} of {listing.data?.total}
              </span>
              <button
                disabled={offset + 50 >= (listing.data?.total || 0)}
                onClick={() => setOffset(offset + 50)}
              >
                Next
              </button>
            </div>
          )}
          {!!listing.data?.excluded && (
            <details className="catalog-reimport">
              <summary>
                {listing.data.excluded} removed file paths excluded from scans
              </summary>
              <p className="muted small">
                If you removed the wrong entry, allow these paths to be imported
                again, then scan your folders. This resets exclusions for all
                removed files.
              </p>
              {!allow ? (
                <button className="secondary" onClick={() => setAllow(true)}>
                  Allow removed files to be imported again
                </button>
              ) : (
                <div className="button-row">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={reimport}
                  >
                    {busy ? "Updating..." : "Confirm allow re-import"}
                  </button>
                  <button
                    className="ghost"
                    disabled={busy}
                    onClick={() => setAllow(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </details>
          )}
        </>
      )}
      {notice && (
        <p role="status" className="movie-review-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
