import { QrCode } from "@/ui/QrCode";

export type CardSize = "lg" | "md" | "sm";
const S: Record<CardSize, { w: string; label: string; qr: string; pad: string; small: string }> = {
  lg: { w: "w-[170mm]", label: "text-[44mm] leading-none", qr: "size-[92mm]", pad: "p-[10mm]", small: "text-[4.2mm]" },
  md: { w: "w-[92mm]", label: "text-[17mm] leading-none", qr: "size-[56mm]", pad: "p-[6mm]", small: "text-[3.1mm]" },
  sm: { w: "w-[62mm]", label: "text-[11mm] leading-none", qr: "size-[40mm]", pad: "p-[4mm]", small: "text-[2.5mm]" },
};

/** One printable table card. Fixed light colours on purpose: it is paper, and QR scanners need the contrast. */
export function QrCard({ orgName, logoUrl, kind, label, sub, url, size = "md", accent = "#0f766e" }: { orgName: string; logoUrl?: string | null; kind: "table" | "room"; label: string; sub?: string; url: string; size?: CardSize; accent?: string }) {
  const s = S[size];
  return (
    <div className={`qr-card ${s.w} ${s.pad} flex flex-col items-center rounded-[4mm] border-2 bg-white text-center text-[#111]`} style={{ borderColor: accent }}>
      <div className="flex items-center gap-2">
        {logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoUrl} alt="" className="h-[7mm] w-auto rounded" /> : null}
        <p className={`${s.small} font-bold uppercase tracking-wider`} style={{ color: accent }}>{orgName}</p>
      </div>
      <p className={`mt-[3mm] ${s.small} font-semibold uppercase tracking-[0.2em] text-[#555]`}>{kind === "table" ? "Table" : "Room"}</p>
      <p className={`${s.label} font-extrabold`}>{label}</p>
      {sub ? <p className={`${s.small} text-[#555]`}>{sub}</p> : null}
      <div className="my-[3mm] rounded-[3mm] border border-[#ddd] p-[1.5mm]"><QrCode value={url} className={s.qr} title={`QR code for ${kind} ${label}`} /></div>
      <p className={`${s.small} font-bold`} style={{ color: accent }}>Scan to order</p>
      <ol className={`mt-[1.5mm] ${s.small} text-[#444]`}>
        <li>1 · Scan with your phone camera</li>
        <li>2 · Pick your food and send it</li>
        <li>3 · We bring it to you</li>
      </ol>
    </div>
  );
}
