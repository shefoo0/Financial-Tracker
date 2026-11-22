import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appsTable, byStars, lowStars, normalizeItunesApps, normalizeItunesReviews, normalizePlayApp, normalizePlayReviews,
  reviewsIos, reviewsText, searchIos,
} from "../scripts/store-lookup.mjs";

const itunesSearch = {
  resultCount: 2,
  results: [
    { kind: "software", trackId: 1009323715, trackName: "Debt Planner", sellerName: "Acme", averageUserRating: 4.7312, userRatingCount: 5120, formattedPrice: "Free", currentVersionReleaseDate: "2026-09-01T07:00:00Z", primaryGenreName: "Finance", trackViewUrl: "https://apps.apple.com/app/id1009323715" },
    { kind: "podcast", trackId: 1, trackName: "Not an app" },
  ],
};

const itunesReviews = {
  feed: {
    entry: [
      { "im:name": { label: "Debt Planner" } },
      { "im:rating": { label: "2" }, title: { label: "Sync broke" }, content: { label: "My bank   stopped\nsyncing." }, "im:version": { label: "3.2" }, updated: { label: "2026-10-02T01:00:00-07:00" } },
      { "im:rating": { label: "5" }, title: { label: "Great" }, content: { label: "Love it" }, updated: { label: "2026-10-01T01:00:00-07:00" } },
    ],
  },
};

test("normalizes App Store search results and skips non-apps", () => {
  const apps = normalizeItunesApps(itunesSearch);
  assert.equal(apps.length, 1);
  assert.deepEqual(apps[0], {
    store: "ios", id: "1009323715", name: "Debt Planner", developer: "Acme", rating: 4.7, ratings: 5120, installs: null,
    price: "Free", inAppPurchases: null, updated: "2026-09-01", genre: "Finance", url: "https://apps.apple.com/app/id1009323715",
  });
  assert.deepEqual(normalizeItunesApps({}), []);
});

test("normalizes App Store reviews, skipping the metadata entry", () => {
  const r = normalizeItunesReviews(itunesReviews);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { stars: 2, title: "Sync broke", text: "My bank   stopped\nsyncing.", version: "3.2", date: "2026-10-02" });
  assert.deepEqual(lowStars(r, 3).map((x) => x.stars), [2]);
  assert.equal(reviewsText(lowStars(r, 3)), "[2★ 2026-10-02 v3.2] Sync broke — My bank stopped syncing.");
});

test("normalizes Google Play app details and reviews", () => {
  const a = normalizePlayApp({ appId: "com.x.debt", title: "Debt X", developer: "X", score: 4.46, ratings: 9000, installs: "100,000+", free: true, offersIAP: true, IAPRange: "$0.99 - $9.99", updated: Date.UTC(2026, 7, 3), genre: "Finance", url: "https://play.google.com/store/apps/details?id=com.x.debt" });
  assert.equal(a.rating, 4.5);
  assert.equal(a.installs, "100,000+");
  assert.equal(a.inAppPurchases, "$0.99 - $9.99");
  assert.equal(a.updated, "2026-08-03");
  assert.equal(normalizePlayApp({ appId: "p", title: "Paid", free: false, priceText: "$4.99" }).price, "$4.99");
  const r = normalizePlayReviews({ data: [{ score: 1, text: "Ads everywhere", date: "2026-10-05T00:00:00.000Z", version: "2.0" }] });
  assert.deepEqual(r, [{ stars: 1, title: "", text: "Ads everywhere", version: "2.0", date: "2026-10-05" }]);
});

test("searchIos builds the right request", async () => {
  let called;
  const fetchImpl = async (url) => ((called = url), { ok: true, json: async () => itunesSearch });
  const apps = await searchIos("debt planner", { country: "ae", limit: 5, fetchImpl });
  assert.equal(called, "https://itunes.apple.com/search?term=debt+planner&country=ae&entity=software&limit=5");
  assert.equal(apps[0].name, "Debt Planner");
});

test("reviewsIos pages until the feed ends", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes("page=1")) return { ok: true, json: async () => itunesReviews };
    if (url.includes("page=2")) return { ok: true, json: async () => ({ feed: {} }) };
    return { ok: false, status: 400 };
  };
  const r = await reviewsIos("123", { country: "ae", fetchImpl });
  assert.equal(r.length, 2);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\/ae\/rss\/customerreviews\/page=1\/id=123\/sortBy=mostRecent\/json$/);
  await assert.rejects(reviewsIos("1", { fetchImpl: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});

test("prints a readable table", () => {
  const t = appsTable(normalizeItunesApps(itunesSearch));
  assert.match(t.split("\n")[0], /^STORE\s+NAME\s+ID\s+RATING/);
  assert.match(t, /ios\s+Debt Planner\s+1009323715\s+4\.7\s+5120/);
});

test("byStars picks a star range: low for gaps, 5 for what people love", () => {
  const r = [{ stars: 1 }, { stars: 3 }, { stars: 4 }, { stars: 5 }, { stars: 5 }];
  assert.deepEqual(byStars(r, 5, 5).map((x) => x.stars), [5, 5]);
  assert.deepEqual(byStars(r, 1, 3).map((x) => x.stars), [1, 3]);
  assert.equal(byStars(r).length, 5);
});
