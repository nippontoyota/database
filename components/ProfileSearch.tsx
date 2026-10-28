"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MultiSelect, { type Option } from "./MultiSelect";

type OptionsPayload = {
  profiles: string[];
  rtos: string[];
};

export default function ProfileSearch() {
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<string[]>([]);
  const [rtos, setRtos] = useState<string[]>([]);

  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    fetch("/api/profiles/options")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Request failed");
        return r.json();
      })
      .then(setOptions)
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const profileOptions: Option[] = useMemo(
    () => (options?.profiles ?? []).map((p) => ({ value: p, label: p })),
    [options]
  );
  const rtoOptions: Option[] = useMemo(
    () => (options?.rtos ?? []).map((r) => ({ value: r, label: r })),
    [options]
  );

  const filtersPayload = useMemo(() => ({ profiles, rtos }), [profiles, rtos]);

  useEffect(() => {
    if (!options) return;
    const controller = new AbortController();
    setCounting(true);
    setCountError(null);

    const t = setTimeout(() => {
      fetch("/api/profiles/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filtersPayload),
        signal: controller.signal,
      })
        .then(async (r) => {
          const body = await r.json().catch(() => null);
          if (!r.ok) throw new Error(body?.error ?? "Could not count records");
          setCount(body.count);
          setCounting(false);
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setCountError(e.message);
          setCounting(false);
        });
    }, 250);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [filtersPayload, options]);

  function clearAll() {
    setProfiles([]);
    setRtos([]);
  }

  const anyFilter = profiles.length + rtos.length > 0;
  const canDownload = !counting && count !== null && count > 0;

  return (
    <>
      {loadError && (
        <div className="error" role="alert">
          Could not load the filter options: {loadError}.
        </div>
      )}

      <section className="panel" aria-label="Filters">
        <div className="filters">
          <MultiSelect
            label="Profile"
            allLabel="All profiles"
            options={profileOptions}
            selected={profiles}
            onChange={setProfiles}
            disabled={!options}
          />
          <MultiSelect
            label="RTO No"
            allLabel="All RTOs"
            options={rtoOptions}
            selected={rtos}
            onChange={setRtos}
            disabled={!options}
          />
        </div>

        <div className="summary">
          <div>
            <div className={`count${counting ? " is-stale" : ""}`} aria-live="polite">
              {count === null ? "…" : count.toLocaleString("en-IN")}
            </div>
            <div className="count-label">records match</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {anyFilter && (
              <button type="button" className="link-btn" onClick={clearAll}>
                Clear filters
              </button>
            )}
            <form ref={formRef} action="/api/profiles/export" method="post">
              <input type="hidden" name="filters" value={JSON.stringify(filtersPayload)} />
              <button className="btn" type="submit" disabled={!canDownload}>
                Download CSV
              </button>
            </form>
          </div>
        </div>
      </section>

      {countError && (
        <div className="error" role="alert">
          {countError}
        </div>
      )}
    </>
  );
}
