import type { RowIssue } from "@/lib/uploadStream";

function groupByReason(rows: RowIssue[]) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export default function UploadIssueList({
  title,
  labelHeader,
  count,
  rows,
}: {
  title: string;
  labelHeader: string;
  count: number;
  rows: RowIssue[];
}) {
  if (count === 0) return null;
  const byReason = groupByReason(rows);

  return (
    <details className="issue-list">
      <summary>
        {title} ({count.toLocaleString("en-IN")})
      </summary>
      <ul className="issue-reasons">
        {byReason.map(([reason, c]) => (
          <li key={reason}>
            {c.toLocaleString("en-IN")} × {reason}
          </li>
        ))}
      </ul>
      <div className="issue-table-wrap">
        <table className="issue-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>{labelHeader}</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.row}>
                <td>{r.row}</td>
                <td>{r.label}</td>
                <td>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {count > rows.length && (
        <p className="hint">Showing the first {rows.length.toLocaleString("en-IN")} of {count.toLocaleString("en-IN")}.</p>
      )}
    </details>
  );
}
