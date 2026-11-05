import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { encodeQr, maxBytes } from "@/platform/qr/encode";
import { qrPath, qrSvg } from "@/platform/qr/svg";

test("QR matrix has the mandatory function patterns for every version", () => {
  for (const len of [1, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213]) {
    const m = encodeQr("x".repeat(len)); const n = m.length;
    assert.equal((n - 17) % 4, 0);
    const finder = (r: number, c: number) => { for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) assert.equal(m[r + i]![c + j], i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4), `finder at ${r},${c}`); };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    for (let i = 8; i < n - 8; i++) { assert.equal(m[6]![i], i % 2 === 0); assert.equal(m[i]![6], i % 2 === 0); } // timing
    assert.equal(m[n - 8]![8], true); // dark module
  }
});

test("QR encoding is deterministic, handles unicode and rejects oversize payloads", () => {
  assert.deepEqual(encodeQr("https://pos.example.com/o/abc"), encodeQr("https://pos.example.com/o/abc"));
  assert.notDeepEqual(encodeQr("https://pos.example.com/o/abc"), encodeQr("https://pos.example.com/o/abd"));
  assert.ok(encodeQr("Café ☕ 日本語").length >= 21);
  assert.ok(maxBytes() >= 200);
  assert.throws(() => encodeQr("x".repeat(260)), /too long/);
});

test("QR SVG output is compact and well-formed", () => {
  const m = encodeQr("https://pos.example.com/o/abc");
  const { d, size } = qrPath(m);
  assert.equal(size, m.length + 8);
  assert.match(d, /^M\d+ \d+h\d+v1h-\d+z/);
  const svg = qrSvg("hi");
  assert.match(svg, /^<svg xmlns=.*viewBox="0 0 29 29"/); assert.ok(svg.length < 4000);
});

// Real decode check: OpenCV must read every code we produce. Skipped where python3+cv2 are unavailable.
const hasCv = spawnSync("python3", ["-c", "import cv2"]).status === 0;
test("OpenCV decodes the generated codes (real-world URLs, every version)", { skip: !hasCv }, () => {
  const urls = [
    ...Array.from({ length: 60 }, () => `https://pos.example.com/${Math.random() < 0.5 ? "o" : "r"}/${randomBytes(18).toString("base64url")}`),
    ...[1, 12, 30, 55, 80, 110, 140, 170, 200, 213].map((n) => "https://x.test/" + "q9Zk".repeat(60).slice(0, Math.max(0, n - 15))),
  ];
  const payload = JSON.stringify(urls.map((text) => ({ text, matrix: encodeQr(text).map((r) => r.map((v) => (v ? 1 : 0))) })));
  const py = `
import json, sys, cv2, numpy as np
bad = 0
for s in json.load(sys.stdin):
    m = np.array(s["matrix"], dtype=np.uint8); ok = False
    for fx in (8, 5, 10, 6, 3, 12):          # OpenCV's detector is scale-sensitive; a phone camera is not
        for qz in (4, 8):
            img = cv2.resize(np.pad((1 - m) * 255, qz, constant_values=255).astype(np.uint8), None, fx=fx, fy=fx, interpolation=cv2.INTER_NEAREST)
            if cv2.QRCodeDetector().detectAndDecode(img)[0] == s["text"]: ok = True; break
        if ok: break
    bad += not ok
print(bad)`;
  const r = spawnSync("python3", ["-c", py], { input: payload, encoding: "utf8" });
  assert.equal(r.stdout.trim(), "0", r.stderr);
});
