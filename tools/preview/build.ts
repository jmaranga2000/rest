/**
 * Visual preview harness (Storybook-lite). Renders views with fixture data to static
 * HTML using the real Tailwind v4 compiler, then screenshots them with Playwright.
 *   npm run preview            → .preview/*.html + .preview/shots/*.png
 * Pages are registered in tools/preview/pages.tsx.
 */
process.env.MONGODB_URI ??= "memory"; process.env.APP_SECRET ??= "preview-secret-preview-secret-preview-secret-0123"; process.env.APP_URL ??= "https://pos.mamaoliech.co.ke";
import { build } from "esbuild";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(__dirname, "../..");
const out = join(root, ".preview");
mkdirSync(join(out, "shots"), { recursive: true });

function walk(dir: string, acc: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, acc); else if (/\.(tsx?|css)$/.test(f)) acc.push(p);
  }
  return acc;
}

async function compileCss(): Promise<string> {
  const tw = await import(pathToFileURL(join(root, "node_modules/tailwindcss/dist/lib.mjs")).href);
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  const compiler = await tw.compile(css, {
    base: join(root, "src/app"),
    loadStylesheet: async (id: string, base: string) => {
      const file = id === "tailwindcss" ? join(root, "node_modules/tailwindcss/index.css")
        : id.startsWith("tailwindcss/") ? join(root, "node_modules", id + (id.endsWith(".css") ? "" : ".css"))
        : resolve(base, id);
      return { path: file, base: dirname(file), content: readFileSync(file, "utf8") };
    },
  });
  const candidates = new Set<string>();
  for (const f of [...walk(join(root, "src")), ...walk(join(root, "tools/preview"))]) {
    for (const m of readFileSync(f, "utf8").matchAll(/[^\s"'`<>=(){}\;,]+/g)) candidates.add(m[0]);
  }
  return compiler.build([...candidates]);
}

async function main() {
  const bundle = join(out, "pages.cjs");
  await build({
    entryPoints: [join(root, "tools/preview/pages.tsx")], bundle: true, platform: "node", format: "cjs", outfile: bundle,
    jsx: "automatic", external: ["mongodb", "react", "react-dom", "react-dom/server", "react/jsx-runtime"], logLevel: "error",
    tsconfig: join(root, "tsconfig.json"),
    alias: { "next/link": join(root, "tools/shims/next-link.tsx"), "next/navigation": join(root, "tools/shims/next-navigation.ts"), "next/headers": join(root, "tools/shims/next-headers.ts") },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const { renderToStaticMarkup } = await import("react-dom/server");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(bundle) as { pages: Record<string, { path?: string; el: () => unknown; bare?: boolean; width?: number; dark?: boolean }> };
  const css = await compileCss();
  const names: string[] = [];
  for (const [name, page] of Object.entries(mod.pages)) {
    (globalThis as { __PATH?: string }).__PATH = page.path ?? "/app";
    const html = renderToStaticMarkup(page.el() as never);
    for (const theme of page.dark === false ? ["light"] : ["light", "dark"]) {
      writeFileSync(join(out, `${name}.${theme}.html`), `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>${css}</style></head><body>${html}</body></html>`);
      names.push(`${name}.${theme}`);
    }
  }
  writeFileSync(join(out, "index.json"), JSON.stringify(Object.entries(mod.pages).map(([n, p]) => ({ name: n, width: p.width ?? 1280 }))));
  console.log(`rendered ${names.length} pages → ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
