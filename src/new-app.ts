// Starts one session for one app idea: the App Lead plans and delegates to its
// team (developers, reviewer, test engineer, QC). Streams progress and downloads
// the deliverables when the grader is done.
//
//   npm run new-app -- "Offline habit tracker for shift workers" --bundle-id com.you.shifthabits

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseCli, usdToCents, UsageError, USAGE, type CliOptions } from "./args.ts";
import { formatEvent, ThreadNames, type StreamEvent } from "./events.ts";
import { loadIds } from "./lock.ts";
import { buildOutcomeEvent } from "./outcome.ts";
import { safeRelativePath } from "./paths.ts";

const client = new Anthropic();
const threads = new ThreadNames();

async function main() {
  let opts: CliOptions;
  try {
    opts = parseCli(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      if (err.message) console.error(err.message + "\n");
      console.error(USAGE);
      process.exit(2);
    }
    throw err;
  }

  const ids = loadIds();
  if (!ids.vaultId) console.warn("No vault found: EAS builds will be skipped (see README to add EXPO_TOKEN).");

  const session = await client.beta.sessions.create({
    agent: ids.agentId,
    environment_id: ids.environmentId,
    title: `App: ${opts.idea.slice(0, 80)}`,
    ...(ids.vaultId ? { vault_ids: [ids.vaultId] } : {}),
    budget: { type: "limit", max_list_cost: { amount: usdToCents(opts.budgetUsd), currency: "USD" } },
    // A non-empty initial_events starts the agent in the same call.
    initial_events: [buildOutcomeEvent(opts, opts.maxIterations)],
  });

  console.log(`Session ${session.id} started (budget $${opts.budgetUsd}).`);
  console.log(`Watch it live: https://platform.claude.com/workspaces/default/sessions/${session.id}`);
  console.log(`Or attach a terminal: ant beta:sessions connect ${session.id}\n`);

  const stopReason = await follow(session.id);

  const outDir = join(opts.outDir, session.id);
  const saved = await downloadOutputs(session.id, outDir);

  console.log(`\n\nSession ended: ${stopReason}.`);
  if (stopReason === "budget_reached") {
    console.log(`Budget cap hit. Raise it to resume, e.g. via the Console or sessions.update(${session.id}, { budget: ... }).`);
  }
  if (saved.length) {
    console.log(`Saved ${saved.length} file(s) to ${outDir}/ - start with REPORT.md.`);
  } else {
    console.log("No output files were found for this session.");
  }
  console.log("Review the app and its 'Before you submit' checklist before uploading anything to the stores.");
}

// Streams events until the session is done, reconnecting losslessly if the
// connection drops (history first, then the live tail, deduped by event ID).
async function follow(sessionId: string): Promise<string> {
  const seen = new Set<string>();
  for (let attempt = 0; ; attempt++) {
    try {
      const stream = await client.beta.sessions.events.stream(sessionId);
      for await (const event of client.beta.sessions.events.list(sessionId)) {
        const done = await consume(sessionId, event as StreamEvent, seen);
        if (done) return done;
      }
      for await (const event of stream) {
        const done = await consume(sessionId, event, seen);
        if (done) return done;
      }
    } catch (err) {
      if (attempt >= 5 || !(err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError)) {
        throw err;
      }
      console.error(`\n[stream dropped, reconnecting: ${(err as Error).message}]`);
      await sleep(2000 * (attempt + 1));
    }
  }
}

// Handles one event; returns the stop reason when the session is finished.
async function consume(sessionId: string, event: StreamEvent, seen: Set<string>): Promise<string | undefined> {
  const isNew = !("id" in event) || !seen.has(event.id);
  if ("id" in event) seen.add(event.id);

  if (isNew) await handle(sessionId, event);

  // Terminal checks run even for already-seen events.
  if (event.type === "session.status_terminated") return "terminated";
  if (event.type === "session.status_idle" && event.stop_reason.type !== "requires_action") {
    return event.stop_reason.type;
  }
  return undefined;
}

async function handle(sessionId: string, event: StreamEvent) {
  threads.remember(event);
  // Calls paused for approval, including ones cross-posted from sub-agent threads.
  if ((event.type === "agent.tool_use" || event.type === "agent.mcp_tool_use") && event.evaluated_permission === "ask") {
    const who = threads.nameOf(event.session_thread_id);
    const allow = await confirm(`${who} wants to run ${event.name} ${JSON.stringify(event.input).slice(0, 300)}. Allow?`);
    await client.beta.sessions.events.send(sessionId, {
      events: [
        {
          type: "user.tool_confirmation",
          tool_use_id: event.id,
          result: allow ? "allow" : "deny",
          ...(allow ? {} : { deny_message: "The developer declined this action. Find another way or note it in REPORT.md." }),
        },
      ],
    });
    return;
  }
  const line = formatEvent(event, threads);
  if (line) process.stdout.write(line);
}

// Asks the person at the terminal. With no terminal attached, nobody is
// watching, so the answer is no.
async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.log(`\n[denied, no terminal] ${question}`);
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`\n${question} [y/N] `);
    return answer.trim().toLowerCase().startsWith("y");
  } finally {
    rl.close();
  }
}

async function downloadOutputs(sessionId: string, outDir: string): Promise<string[]> {
  // Output files can take a few seconds to be indexed after the session idles.
  for (let attempt = 0; attempt < 4; attempt++) {
    const saved: string[] = [];
    for await (const f of client.beta.files.list({ scope_id: sessionId, betas: ["managed-agents-2026-04-01"] })) {
      const rel = safeRelativePath(f.filename);
      const dest = join(outDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      const resp = await client.beta.files.download(f.id);
      writeFileSync(dest, Buffer.from(await resp.arrayBuffer()));
      saved.push(rel);
    }
    if (saved.length) return saved;
    await sleep(2000);
  }
  return [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  if (err instanceof Anthropic.APIError) console.error(`API error ${err.status}: ${err.message}`);
  else console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
