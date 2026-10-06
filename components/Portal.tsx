"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MultiSelect, { type Option } from "./MultiSelect";

type OptionsPayload = {
  years: number[];
  makers: string[];
  models: { maker: string; model: string }[];
  rtos: { code: string; district: string | null }[];
};

export default function Portal({ email }: { email: string }) {
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [years, setYears] = useState<string[]>([]);
  const [makers, setMakers] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [rtos, setRtos] = useState<string[]>([]);

  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  // Load dropdown values once.
  useEffect(() => {
    fetch("/api/options")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Request failed");
        return r.json();
      })
      .then(setOptions)
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  const yearOptions: Option[] = useMemo(
    () => (options?.years ?? []).map((y) => ({ value: String(y), label: String(y) })),
    [options]
  );
  const makerOptions: Option[] = useMemo(
    () => (options?.makers ?? []).map((m) => ({ value: m, label: m })),
    [options]
  );
  const rtoOptions: Option[] = useMemo(
    () =>
      (options?.rtos ?? []).map((r) => ({
        value: r.code,
        label: r.code,
        hint: r.district ?? undefined,
      })),
    [options]
  );
  // Models narrow to the selected makers; with no maker selected, all models are listed.
  const modelOptions: Option[] = useMemo(() => {
    const all = options?.models ?? [];
    const pool = makers.length ? all.filter((m) => makers.includes(m.maker)) : all;
    const seen = new Set<string>();
    const out: Option[] = [];
    for (const m of pool) {
      if (seen.has(m.model)) continue;
      seen.add(m.model);
      out.push({ value: m.model, label: m.model, hint: makers.length ? undefined : m.maker });
    }
    return out;
  }, [options, makers]);

  // Drop any selected model that no longer belongs to the chosen makers.
  useEffect(() => {
    const valid = new Set(modelOptions.map((o) => o.value));
    setModels((prev) => {
      const next = prev.filter((m) => valid.has(m));
      return next.length === prev.length ? prev : next;
    });
  }, [modelOptions]);

  // Live count of matching records.
  const filtersPayload = useMemo(
    () => ({ years: years.map(Number), makers, models, rtos }),
    [years, makers, models, rtos]
  );

  useEffect(() => {
    if (!options) return;
    const controller = new AbortController();
    setCounting(true);
    setCountError(null);

    const t = setTimeout(() => {
      fetch("/api/count", {
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
    setYears([]);
    setMakers([]);
    setModels([]);
    setRtos([]);
  }

  const anyFilter = years.length + makers.length + models.length + rtos.length > 0;
  const canDownload = !counting && count !== null && count > 0;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Registration Data Portal</span>
          <div className="who">
            <span>{email}</span>
            <form action="/auth/signout" method="post">
              <button className="link-btn" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="page">
        <h1>Download registration data</h1>
        <p className="lead">
          Pick one or more values in any filter. A filter left empty includes everything.
        </p>

        {loadError && (
          <div className="error" role="alert">
            Could not load the filter options: {loadError}. Check that schema.sql has been run and
            data has been imported.
          </div>
        )}

        <section className="panel" aria-label="Filters">
          <div className="filters">
            <MultiSelect
              label="Year"
              allLabel="All years"
              options={yearOptions}
              selected={years}
              onChange={setYears}
              searchable={false}
              disabled={!options}
            />
            <MultiSelect
              label="Maker"
              allLabel="All makers"
              options={makerOptions}
              selected={makers}
              onChange={setMakers}
              disabled={!options}
            />
            <MultiSelect
              label="Model"
              allLabel={makers.length ? "All models of selected makers" : "All models"}
              options={modelOptions}
              selected={models}
              onChange={setModels}
              disabled={!options}
            />
            <MultiSelect
              label="RTO"
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
              {/* A native form post lets the browser stream the file straight to disk. */}
              <form ref={formRef} action="/api/export" method="post">
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

        <p className="hint">
          Large downloads (the full dataset is about 300,000 rows) can take up to a minute to start
          saving. Keep the tab open until the browser finishes.
        </p>
      </main>
    </>
  );
}
