// A user-like driver on top of Playwright: tap by testID or visible text, type, assert text, record problems.
import { chromium } from 'playwright';

export class Driver {
  constructor() { this.problems = []; this.stepNo = 0; this.current = ''; this.shotDir = null; }

  async open(url, shotDir) {
    this.shotDir = shotDir;
    this.browser = await chromium.launch();
    this.ctx = await this.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    this.page = await this.ctx.newPage();
    this.page.setDefaultTimeout(5000);
    this.page.on('pageerror', (e) => this.problems.push({ at: this.current, kind: 'pageerror', text: String(e.stack || e).split('\n').slice(0, 4).join(' | ') }));
    this.page.on('console', (m) => { if (m.type() === 'error') this.problems.push({ at: this.current, kind: 'console.error', text: m.text().slice(0, 400) + (m.location()?.url ? ` @ ${m.location().url.split('/').pop()}:${m.location().lineNumber}` : '') }); });
    await this.page.goto(url);
    await this.page.waitForSelector('[data-testid="onboarding-screen"]', { timeout: 20000 });
  }
  async close() { await this.browser?.close(); }

  sel(target) { return target.startsWith('#') ? `[data-testid="${target.slice(1)}"]` : null; }
  /** '#testid' -> testID, /regex/ or 'text' -> visible text (substring, case-insensitive). */
  loc(target, opts = {}) {
    const p = this.page;
    let l;
    if (typeof target === 'string' && target.startsWith('#')) l = p.locator(`[data-testid="${target.slice(1)}"]`);
    else l = p.getByText(target, { exact: !!opts.exact });
    // Screens below the open one stay in the page but are marked inert: ignore anything inside them.
    l = l.and(p.locator(':not([inert] *):not([inert])')).filter({ visible: true });
    return opts.nth != null ? l.nth(opts.nth) : opts.last ? l.last() : l.first();
  }
  async tap(target, opts = {}) {
    const l = this.loc(target, opts);
    await l.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw new Error(`not found within 5s: ${target}`); });
    await l.scrollIntoViewIfNeeded().catch(() => {});
    await l.click({ timeout: 5000 }).catch((e) => { throw new Error(`could not tap ${target}: ${String(e.message).split('\n')[0]}`); });
    await this.settle();
  }
  async tapLabel(label, opts = {}) { // accessibility label (buttons in this app carry their label)
    const l = this.page.getByLabel(label, { exact: opts.exact ?? true }).filter({ visible: true }).first();
    await l.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw new Error(`no control labelled "${label}" within 5s`); });
    await l.scrollIntoViewIfNeeded().catch(() => {});
    await l.click();
    await this.settle();
  }
  async type(target, value) {
    const l = this.loc(target);
    await l.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw new Error(`field not found within 5s: ${target}`); });
    await l.scrollIntoViewIfNeeded().catch(() => {});
    await l.click();
    await l.fill(String(value));
    await this.settle(50);
  }
  async see(target, opts = {}) {
    const l = this.loc(target, opts);
    await l.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw new Error(`expected to see ${target} but it was not shown within 5s`); });
  }
  async notSee(target, opts = {}) {
    const l = this.loc(target, opts);
    await l.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { throw new Error(`${target} is still shown`); });
  }
  async has(target, opts = {}) { return (await this.loc(target, opts).count()) > 0; }
  async count(target) { return this.page.locator(`[data-testid^="${target}"]:visible`).count(); }
  async text(target, opts = {}) { await this.see(target, opts); return (await this.loc(target, opts).innerText()).replace(/\s+/g, ' ').trim(); }
  async seeText(target, re) {
    const t = await this.text(target);
    if (!re.test(t)) throw new Error(`${target} shows "${t.slice(0, 120)}", expected ${re}`);
    return t;
  }
  async body() { return (await this.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | '); }
  async settle(ms = 120) { await this.page.waitForTimeout(ms); }
  async alertPick(text) { await this.page.evaluate((t) => { window.__alertPick = t; }, text); }
  async alerts() { return this.page.evaluate(() => window.__alerts || []); }
  async clearAlerts() { await this.page.evaluate(() => { window.__alerts = []; window.__alertPick = null; }); }
  async shot(name) {
    const file = `${this.shotDir}/${String(++this.stepNo).padStart(2, '0')}-${name}.png`;
    await this.page.screenshot({ path: file });
  }
  async dump(label = '') {
    const ids = await this.page.evaluate(() => [...document.querySelectorAll('[data-testid]')].filter((e) => e.offsetParent !== null).map((e) => e.dataset.testid));
    console.log(`--- dump ${label}\nIDS: ${[...new Set(ids)].join(' ')}\nTEXT: ${(await this.body()).slice(0, 1500)}`);
  }
}

// Get back to a tab screen before a new section (a failed section may have left a form or sheet open).
Driver.prototype.recover = async function () {
  for (let i = 0; i < 4; i++) {
    if (await this.page.locator('[data-testid="onboarding-screen"], [data-testid="lock-screen"]').filter({ visible: true }).count()) return;
    const tab = this.page.getByRole('tab', { name: /Home/ }).filter({ visible: true }).first();
    if (await tab.count()) { await tab.click().catch(() => {}); await this.settle(); return; }
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.evaluate(() => history.back());
    await this.settle(300);
  }
};

Driver.prototype.tab = async function (name) {
  const t = this.page.getByRole('tab', { name }).filter({ visible: true }).first();
  await t.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw new Error(`tab "${name}" not found within 5s`); });
  await t.click();
  await this.settle(200);
};
/** Press the stack header's back control (or the browser back if the header has none). */
Driver.prototype.back = async function () {
  const b = this.page.getByRole('button', { name: /^(Back|Plan|Home|Settings|Month)$/ }).filter({ visible: true }).first();
  if (await b.count()) await b.click(); else await this.page.evaluate(() => history.back());
  await this.settle(300);
};
