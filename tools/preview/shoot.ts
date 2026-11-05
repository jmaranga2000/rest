import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const out = resolve(__dirname, "../../.preview");
async function main() {
  const only = process.argv.slice(2);
  const pages: { name: string; width: number; full?: boolean }[] = JSON.parse(readFileSync(join(out, "index.json"), "utf8"));
  const browser = await chromium.launch();
  for (const p of pages) {
    if (only.length && !only.some((o) => p.name.startsWith(o))) continue;
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport: { width: p.width, height: p.width < 600 ? 800 : 860 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      try { await page.goto(`file://${join(out, `${p.name}.${theme}.html`)}`); } catch { await ctx.close(); continue; }
      await page.screenshot({ path: join(out, "shots", `${p.name}.${theme}.png`), fullPage: true });
      await ctx.close();
    }
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
