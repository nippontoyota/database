"use client";

import { useEffect, useMemo, useState } from "react";
import MultiSelect, { type Option } from "./MultiSelect";
import MonthlyBarChart from "./MonthlyBarChart";

type OptionsPayload = {
  years: number[];
  makers: string[];
  models: { maker: string; model: string }[];
  rtos: { code: string; district: string | null }[];
};

export default function DashboardClient() {
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [years, setYears] = useState<string[]>([]);
  const [makers, setMakers] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [rtos, setRtos] = useState<string[]>([]);

  const [rows, setRows] = useState<{ month: number; count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

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

  useEffect(() => {
    const valid = new Set(modelOptions.map((o) => o.value));
    setModels((prev) => {
      const next = prev.filter((m) => valid.has(m));
      return next.length === prev.length ? prev : next;
    });
  }, [modelOptions]);

  const filtersPayload = useMemo(
    () => ({ years: years.map(Number), makers, models, rtos }),
    [years, makers, models, rtos]
  );

  useEffect(() => {
    if (!options) return;
    const controller = new AbortController();
    setLoading(true);
    setChartError(null);

    const t = setTimeout(() => {
      fetch("/api/admin/monthly-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filtersPayload),
        signal: controller.signal,
      })
        .then(async (r) => {
          const body = await r.json().catch(() => null);
          if (!r.ok) throw new Error(body?.error ?? "Could not load chart data");
          setRows(body.rows);
          setLoading(false);
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setChartError(e.message);
          setLoading(false);
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
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <>
      <h1>Dashboard</h1>
      <p className="lead">Registrations by month. Pick one or more values in any filter.</p>

      {loadError && (
        <div className="error" role="alert">
          Could not load the filter options: {loadError}.
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
            <div className={`count${loading ? " is-stale" : ""}`} aria-live="polite">
              {total.toLocaleString("en-IN")}
            </div>
            <div className="count-label">total matching records</div>
          </div>

          {anyFilter && (
            <button type="button" className="link-btn" onClick={clearAll}>
              Clear filters
            </button>
          )}
        </div>
      </section>

      {chartError && (
        <div className="error" role="alert">
          {chartError}
        </div>
      )}

      <section className={`panel chart-panel${loading ? " is-stale" : ""}`} aria-label="Registrations by month">
        <MonthlyBarChart data={rows} />
      </section>
    </>
  );
}
