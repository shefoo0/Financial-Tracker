#!/usr/bin/env node
// Free store data for research: real ratings, rating counts, prices, update
// dates and reviews (low-star for gaps, 5-star for what people love) from the App Store (Apple's public iTunes Search
// API and reviews feed, no key needed) and Google Play (the open-source
// google-play-scraper package). Read-only; use it lightly, for research.
//
//   node scripts/store-lookup.mjs search "debt planner" [--country ae] [--limit 10] [--store ios|android|both]
//   node scripts/store-lookup.mjs reviews ios 1009323715 [--country ae] [--max-stars 3]
//   node scripts/store-lookup.mjs reviews android com.example.app [--country ae] [--max-stars 3]
//   node scripts/store-lookup.mjs reviews ios 1009323715 --min-stars 5     (what people love and want more of)
//
// Add --json for machine-readable output.

import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const ITUNES = "https://itunes.apple.com";

const round1 = (n) => (typeof n === "number" ? Math.round(n * 10) / 10 : null);
const day = (s) => (s ? String(s).slice(0, 10) : null);

export function normalizeItunesApps(json) {
  return (json?.results ?? [])
    .filter((r) => r.kind === "software" || r.wrapperType === "software")
    .map((r) => ({
      store: "ios",
      id: String(r.trackId),
      name: r.trackName,
      developer: r.sellerName ?? r.artistName ?? null,
      rating: round1(r.averageUserRating),
      ratings: r.userRatingCount ?? 0,
      installs: null,
      price: r.formattedPrice ?? (r.price ? `${r.price} ${r.currency}` : "Free"),
      inAppPurchases: null,
      updated: day(r.currentVersionReleaseDate),
      genre: r.primaryGenreName ?? null,
      url: r.trackViewUrl ?? null,
    }));
}

export function normalizeItunesReviews(json) {
  const entries = json?.feed?.entry ?? [];
  return (Array.isArray(entries) ? entries : [entries])
    .filter((e) => e?.["im:rating"]) // the first entry can be app metadata
    .map((e) => ({
      stars: Number(e["im:rating"].label),
      title: e.title?.label ?? "",
      text: e.content?.label ?? "",
      version: e["im:version"]?.label ?? null,
      date: day(e.updated?.label),
    }));
}

export function normalizePlayApp(a) {
  return {
    store: "android",
    id: a.appId,
    name: a.title,
    developer: a.developer ?? null,
    rating: round1(a.score),
    ratings: a.ratings ?? null,
    installs: a.installs ?? null,
    price: a.free === false ? a.priceText ?? `${a.price}` : "Free",
    inAppPurchases: a.offersIAP ? a.IAPRange ?? "yes" : a.offersIAP === false ? "no" : null,
    updated: a.updated ? new Date(a.updated).toISOString().slice(0, 10) : null,
    genre: a.genre ?? null,
    url: a.url ?? null,
  };
}

export function normalizePlayReviews(list) {
  return (list?.data ?? list ?? []).map((r) => ({
    stars: r.score,
    title: r.title ?? "",
    text: r.text ?? "",
    version: r.version ?? null,
    date: r.date ? new Date(r.date).toISOString().slice(0, 10) : null,
  }));
}

export const lowStars = (reviews, maxStars) => reviews.filter((r) => r.stars <= maxStars);
/** Reviews with minStars ≤ stars ≤ maxStars. */
export const byStars = (reviews, minStars = 1, maxStars = 5) => reviews.filter((r) => r.stars >= minStars && r.stars <= maxStars);

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

export async function searchIos(term, { country = "us", limit = 10, fetchImpl = fetch } = {}) {
  const url = `${ITUNES}/search?${new URLSearchParams({ term, country, entity: "software", limit: String(limit) })}`;
  return normalizeItunesApps(await getJson(url, fetchImpl));
}

export async function reviewsIos(id, { country = "us", pages = 3, fetchImpl = fetch } = {}) {
  const all = [];
  for (let p = 1; p <= pages; p++) {
    const url = `${ITUNES}/${country}/rss/customerreviews/page=${p}/id=${encodeURIComponent(id)}/sortBy=mostRecent/json`;
    let batch;
    try {
      batch = normalizeItunesReviews(await getJson(url, fetchImpl));
    } catch (err) {
      if (p === 1) throw err;
      break; // the feed ends with an error page after its last page
    }
    if (!batch.length) break;
    all.push(...batch);
  }
  return all;
}

async function playModule() {
  try {
    return (await import("google-play-scraper")).default;
  } catch {
    throw new Error("google-play-scraper isn't installed. Run: npm install");
  }
}

export async function searchAndroid(term, { country = "us", limit = 10 } = {}) {
  const gplay = await playModule();
  const hits = await gplay.search({ term, num: limit, country, lang: "en" });
  const apps = [];
  for (const h of hits) {
    try {
      apps.push(normalizePlayApp(await gplay.app({ appId: h.appId, country, lang: "en" })));
    } catch {
      apps.push(normalizePlayApp(h));
    }
  }
  return apps;
}

export async function reviewsAndroid(appId, { country = "us", num = 200 } = {}) {
  const gplay = await playModule();
  return normalizePlayReviews(await gplay.reviews({ appId, country, lang: "en", sort: gplay.sort.NEWEST, num }));
}

export function appsTable(apps) {
  const rows = [["STORE", "NAME", "ID", "RATING", "RATINGS", "INSTALLS", "PRICE", "IAP", "UPDATED"]];
  for (const a of apps) {
    rows.push([a.store, a.name, a.id, a.rating ?? "-", a.ratings ?? "-", a.installs ?? "-", a.price ?? "-", a.inAppPurchases ?? "-", a.updated ?? "-"].map(String));
  }
  const widths = rows[0].map((_, i) => Math.min(40, Math.max(...rows.map((r) => r[i].length))));
  return rows.map((r) => r.map((c, i) => (c.length > widths[i] ? c.slice(0, widths[i] - 1) + "…" : c.padEnd(widths[i]))).join("  ")).join("\n");
}

export function reviewsText(reviews) {
  return reviews.map((r) => `[${r.stars}★ ${r.date ?? ""}${r.version ? ` v${r.version}` : ""}] ${r.title ? r.title + " — " : ""}${r.text.replace(/\s+/g, " ").trim()}`).join("\n");
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      country: { type: "string", default: "us" },
      limit: { type: "string", default: "10" },
      store: { type: "string", default: "both" },
      "max-stars": { type: "string", default: "5" },
      "min-stars": { type: "string", default: "1" },
      json: { type: "boolean", default: false },
    },
  });
  const [cmd, a, b] = positionals;
  const country = values.country.toLowerCase();
  const out = (data, text) => console.log(values.json ? JSON.stringify(data, null, 2) : text);

  if (cmd === "search" && a) {
    const limit = Number(values.limit);
    const stores = values.store === "both" ? ["ios", "android"] : [values.store];
    const apps = [];
    for (const s of stores) {
      try {
        apps.push(...(s === "ios" ? await searchIos(a, { country, limit }) : await searchAndroid(a, { country, limit })));
      } catch (err) {
        console.error(`${s}: ${err.message}`);
      }
    }
    out(apps, appsTable(apps));
    return apps.length ? 0 : 1;
  }
  if (cmd === "reviews" && (a === "ios" || a === "android") && b) {
    const all = a === "ios" ? await reviewsIos(b, { country }) : await reviewsAndroid(b, { country });
    const min = Number(values["min-stars"]);
    const max = Number(values["max-stars"]);
    const picked = byStars(all, min, max);
    out(picked, `${picked.length} of ${all.length} recent reviews (${min}–${max}★)\n\n${reviewsText(picked)}`);
    return 0;
  }
  console.error(`Usage:
  node scripts/store-lookup.mjs search "<term>" [--country ae] [--limit 10] [--store ios|android|both] [--json]
  node scripts/store-lookup.mjs reviews ios <app id> [--country ae] [--max-stars 3] [--json]
  node scripts/store-lookup.mjs reviews android <package> [--country ae] [--max-stars 3] [--json]
  Add --min-stars 5 for the reviews of happy users (what they love and ask for).`);
  return 2;
}

// Node's built-in fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 (Node
// 22.21+). Behind a proxy (cloud sessions), re-run this script with it set.
function rerunWithProxy() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy || process.env.NODE_USE_ENV_PROXY) return null;
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1", NODE_NO_WARNINGS: "1" },
  });
  return r.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = rerunWithProxy();
  if (code !== null) process.exit(code);
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
