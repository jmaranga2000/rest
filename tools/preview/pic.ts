const PAL = [["#f59e0b", "#b45309"], ["#ef4444", "#7f1d1d"], ["#10b981", "#065f46"], ["#3b82f6", "#1e3a8a"], ["#a855f7", "#581c87"]];
/** Illustrative placeholder photo (data URI) for previews only. */
export const pic = (i: number): string => {
  const [a, b] = PAL[i % PAL.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><radialGradient id="g" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="200" cy="150" r="70" fill="#fff" fill-opacity=".18"/><circle cx="200" cy="150" r="42" fill="#fff" fill-opacity=".22"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
