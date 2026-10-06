"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type Option = { value: string; label: string; hint?: string };

type Props = {
  label: string;
  allLabel: string; // shown when nothing is selected, e.g. "All years"
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  disabled?: boolean;
};

const RENDER_LIMIT = 300;

export default function MultiSelect({
  label,
  allLabel,
  options,
  selected,
  onChange,
  searchable = true,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q)
    );
  }, [options, query]);

  const shown = filtered.slice(0, RENDER_LIMIT);

  function toggle(value: string) {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  }

  function selectAllShown() {
    const next = new Set(selectedSet);
    filtered.forEach((o) => next.add(o.value));
    onChange([...next]);
  }

  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length <= 2
      ? selected.map(labelFor).join(", ")
      : `${selected.length} selected`;

  return (
    <div className="ms" ref={rootRef}>
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>

      <button
        type="button"
        className="ms-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`ms-summary${selected.length === 0 ? " is-empty" : ""}`}>{summary}</span>
        {selected.length > 0 && <span className="ms-badge">{selected.length}</span>}
        <span className="ms-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="ms-pop">
          {searchable && (
            <div className="ms-search">
              <input
                type="search"
                autoFocus
                placeholder={`Search ${label.toLowerCase()}`}
                aria-label={`Search ${label}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}

          <div className="ms-actions">
            <button type="button" onClick={selectAllShown}>
              {query ? "Select all matches" : "Select all"}
            </button>
            <button type="button" onClick={() => onChange([])}>
              Clear
            </button>
          </div>

          <ul className="ms-list" role="listbox" aria-multiselectable="true" aria-label={label}>
            {shown.map((o) => (
              <li key={o.value} role="option" aria-selected={selectedSet.has(o.value)}>
                <label className="ms-item">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(o.value)}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="ms-item-text">{o.label}</span>
                  {o.hint && <span className="ms-item-hint">{o.hint}</span>}
                </label>
              </li>
            ))}
          </ul>

          {filtered.length === 0 && <div className="ms-note">Nothing matches “{query}”.</div>}
          {filtered.length > RENDER_LIMIT && (
            <div className="ms-note">
              Showing {RENDER_LIMIT} of {filtered.length.toLocaleString("en-IN")}. Type to narrow
              the list.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
