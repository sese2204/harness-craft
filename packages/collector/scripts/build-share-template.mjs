// Bundles share/entry.tsx (React + @harness-craft/sheet + @harness-craft/sheet-ui) into dist/share-template.html:
// one self-contained HTML file with inline JS, inline CSS and both fonts as data URIs (docs/share-spec.md).
// Runs after `tsc`, so the shared constants come from the compiled dist/shareFormat.js.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import { SHARE_DATA_ID, SHARE_PLACEHOLDER, SHARE_ROOT_ID, SHARE_TEMPLATE_FILE } from '../dist/shareFormat.js';

const ENTRY = fileURLToPath(new URL('../share/entry.tsx', import.meta.url));
const LICENSES_DIR = fileURLToPath(new URL('../dist/licenses', import.meta.url));
const OUT = fileURLToPath(new URL(`../dist/${SHARE_TEMPLATE_FILE}`, import.meta.url));
/** The whole file, fonts included. Checked here and in test/shareTemplate.test.ts. */
const MAX_TEMPLATE_BYTES = 400 * 1024;
/** Browsers with CSS container queries, which the sheet layout needs. */
const TARGETS = ['chrome111', 'edge111', 'firefox115', 'safari16.4'];
const PAGE_BACKGROUND = '#110e1b';
const PAGE_DOTS = '#2a2440';

const require = createRequire(import.meta.url);

async function fontDataUri(specifier, mime) {
  const bytes = await readFile(require.resolve(specifier));
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

async function bundle() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    outdir: 'out',
    format: 'iife',
    platform: 'browser',
    target: TARGETS,
    minify: true,
    jsx: 'automatic',
    legalComments: 'eof',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.module.css': 'local-css', '.css': 'css' },
    logLevel: 'warning',
  });
  const js = result.outputFiles.find((f) => f.path.endsWith('.js'))?.text;
  const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text;
  if (js === undefined || css === undefined) throw new Error('esbuild 결과에 JS 또는 CSS 가 없습니다.');
  return { js, css };
}

/** Inline code must not close its own element or open an HTML comment; fail instead of rewriting code. */
function assertInlineSafe(label, text, closing) {
  const lower = text.toLowerCase();
  for (const bad of [closing, '<!--', SHARE_PLACEHOLDER.toLowerCase()]) {
    if (lower.includes(bad)) throw new Error(`${label} 에 인라인으로 넣을 수 없는 문자열 ${bad} 가 있습니다.`);
  }
}

function pageCss(fonts) {
  return `
@font-face{font-family:'Press Start 2P';src:url(${fonts.pressStart}) format('woff2');font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:'NeoDunggeunmo';src:url(${fonts.neodgm}) format('woff2');font-weight:400;font-style:normal;font-display:swap}
:root{color-scheme:dark;--font-press-start:'Press Start 2P',ui-monospace,Menlo,Consolas,monospace;--font-neodgm:'NeoDunggeunmo','Apple SD Gothic Neo','Malgun Gothic',ui-monospace,monospace}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:${PAGE_BACKGROUND};color:#f3eee2;font-family:var(--font-neodgm),var(--font-press-start),monospace;-webkit-font-smoothing:none}
body{min-height:100vh;padding:28px max(16px,env(safe-area-inset-right)) 48px max(16px,env(safe-area-inset-left));background-color:${PAGE_BACKGROUND};background-image:radial-gradient(${PAGE_DOTS} 1.5px,transparent 1.5px);background-size:10px 10px;image-rendering:pixelated}
body.fit{padding:0}
a{color:#ffc23d;text-decoration:none}
a:focus-visible,button:focus-visible{outline:3px solid #f3eee2;outline-offset:3px}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important}}
`.trim();
}

function html({ js, css }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<!--
  Fonts embedded below, both under the SIL Open Font License 1.1 (https://openfontlicense.org):
  NeoDunggeunmo — Copyright (c) 2021-2026, Eunbin Jeong (Dalgona.), Reserved Font Name NeoDunggeunmo.
  Press Start 2P — Copyright 2012 The Press Start 2P Project Authors, Reserved Font Name "Press Start 2P".
  Full license texts ship in the harness-craft npm package under dist/licenses/.
-->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="${PAGE_BACKGROUND}">
<title>DEV.QUEST</title>
<style>${css}</style>
</head>
<body>
<main id="${SHARE_ROOT_ID}"></main>
<script type="application/json" id="${SHARE_DATA_ID}">${SHARE_PLACEHOLDER}</script>
<script>${js}</script>
</body>
</html>
`;
}

async function main() {
  const [{ js, css: bundleCss }, pressStart, neodgm] = await Promise.all([
    bundle(),
    fontDataUri('@harness-craft/sheet-ui/fonts/PressStart2P-Regular.woff2', 'font/woff2'),
    fontDataUri('@harness-craft/sheet-ui/fonts/neodgm.woff2', 'font/woff2'),
  ]);
  const css = `${pageCss({ pressStart, neodgm })}\n${bundleCss}`;
  assertInlineSafe('JS', js, '</script');
  assertInlineSafe('CSS', css, '</style');
  const out = html({ js, css });
  const bytes = Buffer.byteLength(out);
  if (bytes > MAX_TEMPLATE_BYTES) throw new Error(`공유 템플릿이 ${bytes}바이트로 한도 ${MAX_TEMPLATE_BYTES}바이트를 넘습니다.`);
  await writeFile(OUT, out, 'utf8');
  // 템플릿에 넣은 폰트의 OFL 원문을 패키지에 함께 싣는다(OFL 1.1 2항).
  await mkdir(LICENSES_DIR, { recursive: true });
  for (const name of ['NEODGM-OFL.txt', 'PRESSSTART2P-OFL.txt']) {
    await copyFile(require.resolve(`@harness-craft/sheet-ui/fonts/${name}`), `${LICENSES_DIR}/${name}`);
  }
  process.stderr.write(`공유 템플릿: ${OUT} (${(bytes / 1024).toFixed(1)}KB)\n`);
}

main().catch((err) => {
  process.stderr.write(`공유 템플릿 빌드 실패: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exitCode = 1;
});
