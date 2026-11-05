import { writeFileSync } from "node:fs";
import { encodeQr } from "../src/platform/qr/encode";
// Emits matrices for strings of many lengths so tools/qr-check.py can decode them with OpenCV.
const samples: string[] = ["A", "https://pos.example.com/o/tbl_abc123"];
for (let n = 5; n <= 210; n += 9) samples.push(("https://pos.example.com/r/" + "x7Kq9".repeat(50)).slice(0, n));
samples.push("Café ☕ 日本語 ñ");
writeFileSync(process.argv[2] ?? "/tmp/qr-samples.json", JSON.stringify(samples.map((s) => ({ text: s, matrix: encodeQr(s).map((r) => r.map((v) => (v ? 1 : 0))) }))));
