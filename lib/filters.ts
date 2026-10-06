export type Filters = {
  years: number[];
  makers: string[];
  models: string[];
  rtos: string[];
};

const MAX_VALUES = 5000;

function strings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").slice(0, MAX_VALUES);
}

function numbers(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x))
    .slice(0, MAX_VALUES);
}

/** Cleans whatever the browser sent into a well-typed Filters object. */
export function sanitizeFilters(raw: unknown): Filters {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    years: numbers(r.years),
    makers: strings(r.makers),
    models: strings(r.models),
    rtos: strings(r.rtos),
  };
}

/** An empty selection means "everything", which the SQL functions read as NULL. */
export function toRpcArgs(f: Filters) {
  return {
    p_years: f.years.length ? f.years : null,
    p_makers: f.makers.length ? f.makers : null,
    p_models: f.models.length ? f.models : null,
    p_rtos: f.rtos.length ? f.rtos : null,
  };
}
