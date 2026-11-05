import { cn } from "./cn";

export const CHART_COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export interface BarDatum { label: string; value: number; sub?: string }

/** Vertical bar chart. Pure SVG, server-rendered, scales to its container. */
export function BarChart({ data, format = (n) => String(n), height = 220, color = CHART_COLORS[0]!, emptyLabel = "No data for this period" }: { data: BarDatum[]; format?: (n: number) => string; height?: number; color?: string; emptyLabel?: string }) {
  if (!data.length || data.every((d) => d.value === 0)) return <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>{emptyLabel}</div>;
  const W = 640, padL = 8, padB = 24, padT = 8;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const innerH = height - padB - padT;
  const slot = (W - padL) / data.length;
  const bw = Math.min(40, slot * 0.62);
  const every = Math.ceil(data.length / 12);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Bar chart">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={padT + innerH * (1 - t)} y2={padT + innerH * (1 - t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "3 4"} />
        </g>
      ))}
      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        const x = padL + i * slot + (slot - bw) / 2;
        return (
          <g key={`${d.label}-${i}`}>
            <rect x={x} y={padT + innerH - h} width={bw} height={Math.max(h, d.value > 0 ? 2 : 0)} rx={3} fill={color}><title>{`${d.label}: ${format(d.value)}${d.sub ? ` · ${d.sub}` : ""}`}</title></rect>
            {i % every === 0 ? <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--subtle)">{d.label}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Smooth-less line/area chart for time series. */
export function LineChart({ data, format = (n) => String(n), height = 220, color = CHART_COLORS[0]!, emptyLabel = "No data for this period" }: { data: BarDatum[]; format?: (n: number) => string; height?: number; color?: string; emptyLabel?: string }) {
  if (data.length < 2 || data.every((d) => d.value === 0)) return <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>{emptyLabel}</div>;
  const W = 640, padL = 8, padB = 24, padT = 10, padR = 8;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const innerH = height - padB - padT;
  const step = (W - padL - padR) / (data.length - 1);
  const pts = data.map((d, i) => [padL + i * step, padT + innerH - (d.value / max) * innerH] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1]![0].toFixed(1)},${padT + innerH} L${padL},${padT + innerH} Z`;
  const every = Math.ceil(data.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Line chart">
      {[0, 0.5, 1].map((t) => <line key={t} x1={padL} x2={W - padR} y1={padT + innerH * (1 - t)} y2={padT + innerH * (1 - t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "3 4"} />)}
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3" fill="var(--surface)" stroke={color} strokeWidth="2"><title>{`${data[i]!.label}: ${format(data[i]!.value)}`}</title></circle>
          {i % every === 0 ? <text x={x} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--subtle)">{data[i]!.label}</text> : null}
        </g>
      ))}
    </svg>
  );
}

export function Sparkline({ values, color = CHART_COLORS[0]!, width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden><path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** Ranked horizontal bars — best for "top products", payment mix, category share. */
export function HBarList({ items, format = (n) => String(n), colorIndex = 0, className }: { items: BarDatum[]; format?: (n: number) => string; colorIndex?: number; className?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">No data for this period</p>;
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((it, i) => (
        <li key={`${it.label}-${i}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-fg">{it.label}</span>
            <span className="num shrink-0 text-muted">{it.sub ? <span className="mr-2 text-subtle">{it.sub}</span> : null}<span className="font-medium text-fg">{format(it.value)}</span></span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, background: CHART_COLORS[(colorIndex + i) % CHART_COLORS.length] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Donut({ segments, size = 140, centerLabel, centerValue }: { segments: { label: string; value: number }[]; size?: number; centerLabel?: string; centerValue?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label="Share breakdown">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="16" />
        {total > 0 && segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = <circle key={s.label} cx="70" cy="70" r={r} fill="none" stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)"><title>{s.label}</title></circle>;
          offset += len;
          return el;
        })}
        {centerValue ? <text x="70" y="68" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--fg)">{centerValue}</text> : null}
        {centerLabel ? <text x="70" y="84" textAnchor="middle" fontSize="10" fill="var(--subtle)">{centerLabel}</text> : null}
      </svg>
      <ul className="space-y-1.5 text-[13px]">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-muted">{s.label}</span>
            <span className="num ml-auto pl-3 font-medium text-fg">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
