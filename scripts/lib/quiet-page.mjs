// THE DAEMON NEVER TAKES OVER HIS SCREEN (#958, Ohad 23.10: "make sure you work in the background since every few minutes
// you pop open a new chrome tab").
//
// quietPage(browser): a page for a background job. In a headless browser that is a plain new page. In his signed-in debug
// Chrome (the sheet syncs need its Google session) it is a BACKGROUND tab - created without being activated, so the window
// he is looking at keeps its tab and its focus - and the caller closes it when done.
//
// ensureHeadless(): the address of an off-screen Chrome for the jobs that read public sites (basket.co.il, the league):
// a headless Chrome on 9444 with its own profile, started when nothing answers there. Nothing of his profile is needed.
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export async function quietPage(browser) {
  try {
    if (/headless/i.test(await browser.version())) return await browser.newPage();
    const s = await browser.target().createCDPSession();
    const { targetId } = await s.send('Target.createTarget', { url: 'about:blank', background: true });
    await s.detach().catch(() => {});
    const t = await browser.waitForTarget((x) => x._targetId === targetId, { timeout: 15000 });
    const p = await t.page();
    if (p) return p;
  } catch { /* fall back to a plain page rather than fail the job */ }
  return browser.newPage();
}

const HEADLESS_PORT = Number(process.env.HEADLESS_PORT || 9444);
const up = async (port) => { try { return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2500) })).ok; } catch { return false; } };
export async function ensureHeadless() {
  const url = `http://127.0.0.1:${HEADLESS_PORT}`;
  if (await up(HEADLESS_PORT)) return url;
  const exe = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  spawn(exe, ['--headless=new', `--remote-debugging-port=${HEADLESS_PORT}`, `--user-data-dir=${path.join(os.homedir(), 'chrome-probe-headless')}`,
    '--no-first-run', '--disable-gpu', '--window-size=1440,1000', 'about:blank'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 500)); if (await up(HEADLESS_PORT)) return url; }
  throw new Error(`no headless Chrome on ${HEADLESS_PORT}`);
}
