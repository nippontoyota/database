"use client";

import { useState } from "react";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function MonthlyBarChart({ data }: { data: { month: number; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const counts = Array.from({ length: 12 }, (_, i) => {
    const row = data.find((r) => r.month === i + 1);
    return row?.count ?? 0;
  });
  const max = Math.max(1, ...counts);

  const width = 760;
  const height = 320;
  const padL = 56;
  const padB = 36;
  const padT = 16;
  const padR = 12;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const barGap = 10;
  const barW = (plotW - barGap * 11) / 12;

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((max / yTicks) * i));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Registrations by month" className="chart-svg">
        {tickValues.map((v, i) => {
          const y = padT + plotH - (v / max) * plotH;
          return (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} className="chart-gridline" />
              <text x={padL - 8} y={y} textAnchor="end" dominantBaseline="middle" className="chart-axis-label">
                {v.toLocaleString("en-IN")}
              </text>
            </g>
          );
        })}

        {counts.map((count, i) => {
          const barH = (count / max) * plotH;
          const x = padL + i * (barW + barGap);
          const y = padT + plotH - barH;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(barH, count > 0 ? 1 : 0)}
                className={`chart-bar${hover === i ? " is-hover" : ""}`}
                rx={3}
              />
              <text x={x + barW / 2} y={height - padB + 18} textAnchor="middle" className="chart-axis-label">
                {MONTH_LABELS[i]}
              </text>
              {hover === i && (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="chart-value-label">
                  {count.toLocaleString("en-IN")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
