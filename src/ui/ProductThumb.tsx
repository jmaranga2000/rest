import { cn } from "./cn";

const HUES = [12, 32, 150, 190, 230, 270, 330, 350];
function hueFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}

/** Product photo with a graceful fallback: a tinted tile with the item's initials. */
export function ProductThumb({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" decoding="async" className={cn("shrink-0 bg-surface-2 object-cover", className)} />;
  }
  const hue = hueFor(name);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden className={cn("flex shrink-0 select-none items-center justify-center font-semibold", className)}
      style={{ background: `hsl(${hue} 70% 50% / 0.16)`, color: `hsl(${hue} 55% 38%)` }}>{initials}</span>
  );
}
