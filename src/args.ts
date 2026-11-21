import { parseArgs } from "node:util";
import type { AppRequest } from "./outcome.ts";

export interface CliOptions extends AppRequest {
  budgetUsd: number;
  maxIterations: number;
  outDir: string;
}

export const USAGE = `Usage: npm run new-app -- "<app idea>" [options]

Options:
  --bundle-id <id>        Bundle ID / Android package, e.g. com.yourname.habits
  --monetization <text>   e.g. "free", "$2.99 paid", "freemium: $1.99/mo pro tier"
  --notes <text>          Anything else the agent should know
  --budget <usd>          Hard spend cap for the session in USD (default 40)
  --max-iterations <n>    Grader revision rounds, 1-20 (default 4)
  --out <dir>             Where to download deliverables (default ./output)
`;

const BUNDLE_ID = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export function parseCli(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "bundle-id": { type: "string" },
      monetization: { type: "string" },
      notes: { type: "string" },
      budget: { type: "string", default: "40" },
      "max-iterations": { type: "string", default: "4" },
      out: { type: "string", default: "output" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) throw new UsageError("");
  const idea = positionals.join(" ").trim();
  if (!idea) throw new UsageError("Missing the app idea.");

  const bundleId = values["bundle-id"];
  if (bundleId !== undefined && !BUNDLE_ID.test(bundleId)) {
    throw new UsageError(`Invalid bundle ID "${bundleId}" (expected reverse-DNS like com.yourname.app).`);
  }

  const budgetUsd = Number(values.budget);
  if (!Number.isFinite(budgetUsd) || budgetUsd < 1) {
    throw new UsageError(`--budget must be a number of dollars, at least 1 (got "${values.budget}").`);
  }

  const maxIterations = Number(values["max-iterations"]);
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 20) {
    throw new UsageError(`--max-iterations must be an integer from 1 to 20 (got "${values["max-iterations"]}").`);
  }

  return {
    idea,
    bundleId,
    monetization: values.monetization,
    notes: values.notes,
    budgetUsd,
    maxIterations,
    outDir: values.out!,
  };
}

// Session budgets take an integer string in cents ("2000" = $20.00).
export function usdToCents(usd: number): string {
  return String(Math.round(usd * 100));
}

export class UsageError extends Error {}
