"use client";

import { useState } from "react";

type RowIssue = { row: number; registration_no: string; reason: string };
type Result = {
  totalRows: number;
  inserted: number;
  skippedCount: number;
  failedCount: number;
  skipped: RowIssue[];
  failed: RowIssue[];
  truncated: boolean;
};

function groupByReason(rows: RowIssue[]) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function IssueList({ title, rows }: { title: string; rows: RowIssue[] }) {
  if (rows.length === 0) return null;
  const byReason = groupByReason(rows);

  return (
    <details className="issue-list">
      <summary>
        {title} ({rows.length.toLocaleString("en-IN")})
      </summary>
      <ul className="issue-reasons">
        {byReason.map(([reason, count]) => (
          <li key={reason}>
            {count.toLocaleString("en-IN")} × {reason}
          </li>
        ))}
      </ul>
      <div className="issue-table-wrap">
        <table className="issue-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Registration No</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.row}>
                <td>{r.row}</td>
                <td>{r.registration_no}</td>
                <td>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

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
          <p>
            Inserted {result.inserted.toLocaleString("en-IN")} of{" "}
            {result.totalRows.toLocaleString("en-IN")} rows.
            {result.skippedCount > 0 && ` Skipped ${result.skippedCount.toLocaleString("en-IN")}.`}
            {result.failedCount > 0 && ` Failed ${result.failedCount.toLocaleString("en-IN")}.`}
          </p>

          <IssueList title="Skipped — missing required values, never attempted" rows={result.skipped} />
          <IssueList title="Failed — rejected by the database" rows={result.failed} />

          {result.truncated && (
            <p className="hint">Showing the first 200 of each — fix these and re-upload the rest.</p>
          )}
        </div>
      )}
    </form>
  );
}
