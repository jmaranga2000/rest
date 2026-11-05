import { encodeQr, type QrMatrix } from "./encode";

/** SVG path for the dark modules: horizontal runs merged into single rectangles (small output, crisp at any size). */
export function qrPath(m: QrMatrix, quiet = 4): { d: string; size: number } {
  const n = m.length; let d = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!m[r]![c]) { c++; continue; }
      let end = c; while (end < n && m[r]![end]) end++;
      d += `M${c + quiet} ${r + quiet}h${end - c}v1h${-(end - c)}z`;
      c = end;
    }
  }
  return { d, size: n + quiet * 2 };
}

/** Standalone SVG document for download/print. `quiet` is the mandatory light border, in modules (spec minimum 4). */
export function qrSvg(text: string, opts: { fg?: string; bg?: string; quiet?: number } = {}): string {
  const { d, size } = qrPath(encodeQr(text), opts.quiet ?? 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${opts.bg ?? "#fff"}"/><path d="${d}" fill="${opts.fg ?? "#000"}"/></svg>`;
}
