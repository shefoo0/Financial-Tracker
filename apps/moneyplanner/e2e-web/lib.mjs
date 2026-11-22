// Small helpers for the web walkthrough: static server, build, and user-like actions.
import { createServer } from 'node:http';
import { readFile, stat, mkdir, readdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

export async function serve(dir) {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = normalize(join(dir, url));
      if (!file.startsWith(dir)) throw new Error('outside');
      let s = await stat(file).catch(() => null);
      if (s?.isDirectory()) { file = join(file, 'index.html'); s = await stat(file).catch(() => null); }
      if (!s) file = join(dir, 'index.html'); // SPA fallback
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(500); res.end('error'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

export function build(appDir, outDir) {
  const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', outDir], { cwd: appDir, env: { ...process.env, EXPO_OFFLINE: '1', CI: '1' }, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('web export failed');
}

// react-native-web's Alert.alert does nothing. In the served copy only (never in the app code) replace it with a
// recorder that can press a button by its text, so confirmations can be answered like a user would.
export async function patchAlert(dir) {
  const js = join(dir, '_expo/static/js/web');
  let patched = 0;
  for (const f of await readdir(js)) {
    if (!f.startsWith('entry-')) continue;
    const p = join(js, f);
    let t = await readFile(p, 'utf8');
    const needle = 'class{static alert(){}}';
    if (t.includes(needle)) {
      t = t.replace(needle, 'class{static alert(t,m,b){var w=window;(w.__alerts=w.__alerts||[]).push({title:t,message:m,buttons:(b||[]).map(function(x){return x.text})});var p=w.__alertPick;if(p){var x=(b||[]).find(function(y){return y.text===p});if(x&&x.onPress){setTimeout(function(){x.onPress()},0)}}}}');
      await writeFile(p, t); patched++;
    }
  }
  if (!patched) throw new Error('Alert patch not applied (bundle changed?)');
}

export { mkdir };
