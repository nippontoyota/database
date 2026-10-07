"use client";

import { useState } from "react";

type Result = { totalRows: number; inserted: number; errors: string[] };

export default function UploadDataForm() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(body?.error ?? "Upload failed.");
      setBusy(false);
      return;
    }

    setResult(body);
    setFile(null);
    setBusy(false);
  }

  return (
    <form className="panel admin-form" onSubmit={onSubmit}>
      <h2>Upload data</h2>
      <p className="lead">
        CSV with header: registration_no, registration_date, reg_year, owner_name, owner_mobile,
        maker, model, rto_code, district, pincode, address.
      </p>

      <a className="link-btn" href="/sample-vehicles.csv" download>
        Download sample CSV
      </a>

      <label htmlFor="data-file">CSV file</label>
      <input
        id="data-file"
        type="file"
        accept=".csv,text/csv"
        required
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <button className="btn" type="submit" disabled={busy || !file}>
        {busy ? "Uploading…" : "Upload"}
      </button>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div className="success">
          Inserted {result.inserted.toLocaleString("en-IN")} of{" "}
          {result.totalRows.toLocaleString("en-IN")} rows.
          {result.errors.length > 0 && (
            <ul>
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
