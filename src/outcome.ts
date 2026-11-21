// Builds the `user.define_outcome` event that starts an App Builder session.
// The rubric is what the independent grader checks each iteration against;
// tune it as you learn what a good build looks like for you.

export interface AppRequest {
  idea: string;
  bundleId?: string;
  monetization?: string;
  notes?: string;
}

export function buildDescription(req: AppRequest): string {
  const lines = [
    `Build a store-ready Expo app for this idea: ${req.idea}`,
    req.bundleId
      ? `Use the bundle identifier / Android package: ${req.bundleId}`
      : "No bundle identifier was given: use com.example.<slug> and flag it in REPORT.md.",
    req.monetization
      ? `Monetization: ${req.monetization}`
      : "Monetization: choose what fits the research (free, paid upfront, or freemium with in-app purchase) and justify it in spec.md.",
  ];
  if (req.notes) lines.push(`Extra notes from the developer: ${req.notes}`);
  return lines.join("\n");
}

// Starter rubric: concrete, independently checkable criteria.
export const STARTER_RUBRIC = `# App Builder rubric (starter - tune the criteria)

- /mnt/session/outputs/ contains <slug>.tar.gz, spec.md, REPORT.md, store/listing.md, store/privacy-policy.md and the icon PNGs.
- spec.md names at least 3 real competing apps found in the stores and states the specific gap this app fills.
- The project is an Expo + TypeScript app; app.json sets name, slug, version, ios.bundleIdentifier, android.package and icons.
- Every feature listed in spec.md is implemented: no placeholder screens, lorem ipsum, TODO stubs, dead buttons or "coming soon" items.
- \`npx tsc --noEmit\`, \`npx expo lint\` and the Jest test suite pass, and REPORT.md shows the commands and their results.
- The test suite covers the app's logic and has at least one render test per screen; no tests are skipped.
- \`npx expo export\` succeeds for both android and ios.
- store/listing.md respects the character limits (App Store name/subtitle <=30, keywords <=100, Play short description <=80, full <=4000) and uses no competitor or third-party trademarks.
- The privacy answers in store/listing.md and store/privacy-policy.md match the data the code actually collects and stores.
- REPORT.md includes EAS build links or the reason there are none, every assumption made, and a "Before you submit" checklist.
`;

export function buildOutcomeEvent(req: AppRequest, maxIterations = 4) {
  return {
    type: "user.define_outcome" as const,
    description: buildDescription(req),
    rubric: { type: "text" as const, content: STARTER_RUBRIC },
    max_iterations: maxIterations,
  };
}
