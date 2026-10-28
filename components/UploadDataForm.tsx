"use client";

import { useState } from "react";
import { runChunkedCsvUpload, type UploadProgress, type UploadResult } from "@/lib/uploadStream";
import UploadIssueList from "./UploadIssueList";

export default function UploadDataForm() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(null);

    try {
      const result = await runChunkedCsvUpload(file, "/api/admin/upload", setProgress);
      setResult(result);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
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

      {progress && (
        <div className="upload-progress">
          <div className="upload-progress-bar">
            <div className="upload-progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="hint">
            {progress.percent}% — {progress.rowsDone.toLocaleString("en-IN")} of{" "}
            {progress.rowsTotal.toLocaleString("en-IN")} rows
            {progress.parts > 1 && ` (part ${progress.part} of ${progress.parts})`}
          </p>
          <p className="hint">
            Inserted {progress.inserted.toLocaleString("en-IN")} · Skipped{" "}
            {progress.skipped.toLocaleString("en-IN")} · Failed {progress.failed.toLocaleString("en-IN")}
          </p>
        </div>
      )}

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

          <UploadIssueList
            title="Skipped — missing required values, never attempted"
            labelHeader="Registration No"
            count={result.skippedCount}
            rows={result.skipped}
          />
          <UploadIssueList
            title="Failed — rejected by the database"
            labelHeader="Registration No"
            count={result.failedCount}
            rows={result.failed}
          />
        </div>
      )}
    </form>
  );
}
