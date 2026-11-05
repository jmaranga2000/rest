/**
 * Dependency-free QR Code encoder (ISO/IEC 18004): byte mode, error-correction level M, versions 1-10
 * (up to 213 bytes: plenty for a URL). Returns the module matrix; see ./svg.ts to draw it.
 * Verified by decoding its output with OpenCV for every supported version (see tests/qr.test.ts and tools/qr-check.py).
 */
export type QrMatrix = boolean[][];

// [ecc codewords per block, [[blocks, data codewords per block], ...]] for level M
const BLOCKS_M: Record<number, [number, [number, number][]]> = {
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]],
  6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
};
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
export const MAX_VERSION = 10;

const dataCapacity = (v: number) => BLOCKS_M[v]![1].reduce((a, [n, d]) => a + n * d, 0);
/** Largest payload (bytes) that fits at level M. */
export const maxBytes = (): number => dataCapacity(MAX_VERSION) - 3; // mode+count+terminator overhead (16-bit count at v10)

// ---------- Reed-Solomon over GF(256), primitive polynomial 0x11D ----------
const EXP = new Uint8Array(512); const LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!; })();
const gfMul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

function rsGenerator(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] = next[j]! ^ g[j]!; next[j + 1] = next[j + 1]! ^ gfMul(g[j]!, EXP[i]!); }
    g = next;
  }
  return g; // highest degree first
}
function rsRemainder(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree);
  const rem = new Array<number>(degree).fill(0);
  for (const d of data) {
    const factor = d ^ rem[0]!;
    rem.shift(); rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] = rem[i]! ^ gfMul(gen[i + 1]!, factor);
  }
  return rem;
}

// ---------- bit buffer ----------
function toBytes(text: string): number[] { return [...new TextEncoder().encode(text)]; }

function buildCodewords(bytes: number[], version: number): number[] {
  const [eccLen, groups] = BLOCKS_M[version]!;
  const capacity = dataCapacity(version);
  const bits: number[] = [];
  const push = (value: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const totalBits = capacity * 8;
  push(0, Math.min(4, totalBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);

  // split into blocks, compute ECC, interleave
  const blocks: { data: number[]; ecc: number[] }[] = [];
  let off = 0;
  for (const [n, len] of groups) for (let i = 0; i < n; i++) { const d = data.slice(off, off + len); off += len; blocks.push({ data: d, ecc: rsRemainder(d, eccLen) }); }
  const out: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]!);
  for (let i = 0; i < eccLen; i++) for (const b of blocks) out.push(b.ecc[i]!);
  return out;
}

// ---------- matrix construction ----------
function bch(value: number, poly: number, polyBits: number, shift: number): number {
  let v = value << shift;
  for (let i = polyBits + shift - 1; i >= shift; i--) if ((v >>> i) & 1) v ^= poly << (i - shift);
  return (value << shift) | v;
}
const formatBits = (mask: number): number => (bch((0b00 << 3) | mask, 0x537, 11, 10) ^ 0x5412) & 0x7fff; // level M = 00
const versionBits = (version: number): number => bch(version, 0x1f25, 13, 12);

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (_r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function penalty(m: QrMatrix): number {
  const n = m.length; let score = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        const cur = pass ? m[b]![a]! : m[a]![b]!, prev = pass ? m[b - 1]![a]! : m[a]![b - 1]!;
        if (cur === prev) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1;
      }
      // finder-like 1:1:3:1:1 pattern with 4 light modules on either side
      for (let b = 0; b + 10 < n + 0; b++) {
        const get = (i: number) => (pass ? m[b + i]![a]! : m[a]![b + i]!);
        const p1 = [true, false, true, true, true, false, true, false, false, false, false].every((v, i) => get(i) === v);
        const p2 = [false, false, false, false, true, false, true, true, true, false, true].every((v, i) => get(i) === v);
        if (p1 || p2) score += 40;
      }
    }
  }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const v = m[r]![c]!; if (v === m[r]![c + 1] && v === m[r + 1]![c] && v === m[r + 1]![c + 1]) score += 3; }
  let dark = 0; for (const row of m) for (const v of row) if (v) dark++;
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

export function encodeQr(text: string, forceMask?: number): QrMatrix {
  const bytes = toBytes(text);
  let version = 0;
  for (let v = 1; v <= MAX_VERSION; v++) { const overhead = 4 + (v <= 9 ? 8 : 16); if (bytes.length * 8 + overhead <= dataCapacity(v) * 8) { version = v; break; } }
  if (!version) throw new Error(`QR payload too long (${bytes.length} bytes, max ${maxBytes()})`);
  const size = 17 + 4 * version;
  const codewords = buildCodewords(bytes, version);

  const mod: QrMatrix = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false)); // function-pattern (non-data) modules
  const set = (r: number, c: number, v: boolean) => { if (r >= 0 && r < size && c >= 0 && c < size) { mod[r]![c] = v; fn[r]![c] = true; } };

  const finder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const dark = inside && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      set(r0 + dr, c0 + dc, dark);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); } // timing
  const al = ALIGN[version]!;
  for (const r of al) for (const c of al) {
    if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  set(size - 8, 8, true); // dark module
  // reserve format areas
  const reserve = (r: number, c: number) => { fn[r]![c] = true; }; // mark as non-data WITHOUT overwriting the timing pattern that crosses it
  for (let i = 0; i < 9; i++) { reserve(8, i); reserve(i, 8); }
  for (let i = 0; i < 8; i++) { reserve(8, size - 1 - i); reserve(size - 1 - i, 8); }
  set(size - 8, 8, true);
  if (version >= 7) {
    const vb = versionBits(version);
    for (let i = 0; i < 18; i++) { const bit = ((vb >>> i) & 1) === 1; const a = Math.floor(i / 3), b = (i % 3) + size - 11; set(a, b, bit); set(b, a, bit); }
  }

  // place data bits in the zig-zag order
  const bitsOut: boolean[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bitsOut.push(((cw >>> i) & 1) === 1);
  const remainder = version === 1 ? 0 : version <= 6 ? 7 : 0;
  for (let i = 0; i < remainder; i++) bitsOut.push(false);
  const placeData = (maskFn: ((r: number, c: number) => boolean) | null): QrMatrix => {
    const m = mod.map((row) => row.slice());
    let i = 0; let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col--; // skip the vertical timing column
      for (let step = 0; step < size; step++) {
        const r = upward ? size - 1 - step : step;
        for (const c of [col, col - 1]) {
          if (fn[r]![c]) continue;
          let bit = i < bitsOut.length ? bitsOut[i++]! : false;
          if (maskFn && maskFn(r, c)) bit = !bit;
          m[r]![c] = bit;
        }
      }
      upward = !upward;
    }
    return m;
  };
  const withFormat = (m: QrMatrix, mask: number): QrMatrix => {
    const f = formatBits(mask);
    const bit = (i: number) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) m[i]![8] = bit(i);
    m[7]![8] = bit(6); m[8]![8] = bit(7); m[8]![7] = bit(8);
    for (let i = 9; i < 15; i++) m[8]![14 - i] = bit(i);
    for (let i = 0; i < 8; i++) m[8]![size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) m[size - 15 + i]![8] = bit(i);
    m[size - 8]![8] = true;
    return m;
  };

  let best: QrMatrix | null = null; let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    if (forceMask !== undefined && mask !== forceMask) continue;
    const m = withFormat(placeData(MASKS[mask]!), mask);
    const s = penalty(m);
    if (s < bestScore) { bestScore = s; best = m; }
  }
  return best!;
}
