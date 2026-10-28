export type ProfileFilters = {
  profiles: string[];
  rtos: string[];
};

const MAX_VALUES = 5000;

function strings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").slice(0, MAX_VALUES);
}

/** Cleans whatever the browser sent into a well-typed ProfileFilters object. */
export function sanitizeProfileFilters(raw: unknown): ProfileFilters {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    profiles: strings(r.profiles),
    rtos: strings(r.rtos),
  };
}

/** An empty selection means "everything", which the SQL functions read as NULL. */
export function toProfileRpcArgs(f: ProfileFilters) {
  return {
    p_profiles: f.profiles.length ? f.profiles : null,
    p_rtos: f.rtos.length ? f.rtos : null,
  };
}
