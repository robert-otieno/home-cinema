import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Folder,
  FolderOpen,
  ArrowLeft,
  ChevronRight,
  X,
  HardDrive,
} from "lucide-react";
import { api } from "./api";
type Listing = {
  path: string | null;
  parent: string | null;
  folders: { name: string; path: string }[];
  truncated: boolean;
};
export function FolderPathField() {
  const [value, setValue] = useState(""),
    [open, setOpen] = useState(false),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => setValue("");
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  return (
    <>
      <label>
        Full folder path
        <div className="folder-path-control">
          <input
            ref={input}
            name="path"
            value={value}
            readOnly
            placeholder="Choose a folder on the media server…"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen(true);
              }
            }}
          />
          <button
            type="button"
            className="secondary"
            aria-label="Browse media server folders"
            onClick={() => setOpen(true)}
          >
            <FolderOpen size={18} />
            Browse
          </button>
        </div>
      </label>
      {open && (
        <FolderPicker
          initial={value}
          onClose={() => setOpen(false)}
          onSelect={(path) => {
            setValue(path);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
function FolderPicker({
  initial,
  onClose,
  onSelect,
}: {
  initial: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [path, setPath] = useState(initial),
    [draft, setDraft] = useState(initial),
    [attempt, setAttempt] = useState(0);
  const listing = useQuery({
    queryKey: ["server-folders", path, attempt],
    queryFn: () =>
      api<Listing>(
        "/filesystem/folders" +
          (path ? "?path=" + encodeURIComponent(path) : ""),
      ),
    retry: false,
    staleTime: 30000,
  });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (listing.data?.path) setDraft(listing.data.path);
    else if (listing.data) setDraft("");
  }, [listing.data]);
  function browse() {
    setPath(draft.trim());
    setAttempt((a) => a + 1);
  }
  return (
    <dialog
      ref={dialog}
      className="folder-picker"
      aria-labelledby="folder-picker-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="folder-picker-inner">
        <header>
          <div>
            <span className="small-label">MEDIA SERVER</span>
            <h2 id="folder-picker-title">Choose a library folder</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close folder picker"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <p className="muted small">
          Browse folders on the computer running Home Cinema. You can also enter
          a mounted network or full folder path.
        </p>
        <div className="folder-picker-path">
          <input
            autoFocus
            aria-label="Server folder path"
            placeholder="Enter a full server or network folder path"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                browse();
              }
            }}
          />
          <button type="button" className="secondary" onClick={browse}>
            Open
          </button>
        </div>
        <nav aria-label="Folder navigation">
          <button type="button" className="ghost" onClick={() => setPath("")}>
            <HardDrive size={16} />
            Locations
          </button>
          {listing.data?.parent && (
            <button
              type="button"
              className="ghost"
              onClick={() => setPath(listing.data!.parent!)}
            >
              <ArrowLeft size={16} />
              Up one level
            </button>
          )}
          <span>{listing.data?.path || "Choose a drive or location"}</span>
        </nav>
        <div className="folder-picker-list" aria-busy={listing.isFetching}>
          {listing.isFetching ? (
            <p className="muted">Opening folder…</p>
          ) : listing.error ? (
            <p className="error" role="alert">
              {listing.error.message}
            </p>
          ) : (
            <>
              {listing.data?.folders.map((folder) => (
                <button
                  type="button"
                  key={folder.path}
                  onClick={() => setPath(folder.path)}
                >
                  <Folder size={20} />
                  <span>{folder.name}</span>
                  <ChevronRight size={17} />
                </button>
              ))}
              {!listing.data?.folders.length && (
                <p className="muted">
                  No subfolders. You can select the current folder.
                </p>
              )}
              {listing.data?.truncated && (
                <p className="muted small">
                  This folder has more entries. Enter the full path above to
                  open a folder that is not listed.
                </p>
              )}
            </>
          )}
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={
              !listing.data?.path || listing.isFetching || !!listing.error
            }
            onClick={() => onSelect(listing.data!.path!)}
          >
            <FolderOpen size={17} />
            Select this folder
          </button>
        </footer>
      </div>
    </dialog>
  );
}
