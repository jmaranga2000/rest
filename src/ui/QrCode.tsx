import { encodeQr } from "@/platform/qr/encode";
import { qrPath } from "@/platform/qr/svg";

/** Scannable QR code as inline SVG. Server- and print-friendly; always dark-on-white (scanners need the contrast, even in dark mode). */
export function QrCode({ value, className, title }: { value: string; className?: string; title?: string }) {
  const { d, size } = qrPath(encodeQr(value), 4);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label={title ?? "QR code"} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" /><path d={d} fill="#111111" />
    </svg>);
}
