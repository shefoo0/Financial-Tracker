import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEvent, ThreadNames, type StreamEvent } from "../src/events.ts";

const ev = (e: Record<string, unknown>) => ({ id: "sevt_1", processed_at: "2026-11-21T00:00:00Z", ...e }) as unknown as StreamEvent;

test("thread names default to the lead and learn sub-agents", () => {
  const t = new ThreadNames();
  assert.equal(t.nameOf(undefined), "App Lead");
  assert.equal(t.nameOf("th_1"), "App Lead");
  t.remember(ev({ type: "session.thread_created", session_thread_id: "th_1", agent_name: "Code Reviewer", workflow_run_id: null }));
  assert.equal(t.nameOf("th_1"), "Code Reviewer");
});

test("formats delegation traffic", () => {
  const t = new ThreadNames();
  t.remember(ev({ type: "session.thread_created", session_thread_id: "th_2", agent_name: "Test Engineer", workflow_run_id: null }));
  const sent = formatEvent(ev({ type: "agent.thread_message_sent", to_session_thread_id: "th_2", content: [{ type: "text", text: "\nRun all checks in /workspace/app\nmore" }] }), t);
  assert.equal(sent, "→ brief to Test Engineer: Run all checks in /workspace/app\n");
  const got = formatEvent(ev({ type: "agent.thread_message_received", from_session_thread_id: "x", from_agent_name: "QC Inspector", content: [{ type: "text", text: "Verdict: pass" }] }), t);
  assert.equal(got, "← report from QC Inspector: Verdict: pass\n");
});

test("truncates long report lines", () => {
  const line = formatEvent(ev({ type: "agent.thread_message_received", from_session_thread_id: "x", from_agent_name: "A", content: [{ type: "text", text: "x".repeat(500) }] }), new ThreadNames())!;
  assert.ok(line.length < 200);
  assert.ok(line.includes("…"));
});

test("formats workflow runs and thread starts", () => {
  const t = new ThreadNames();
  assert.match(formatEvent(ev({ type: "workflow_run.created", workflow_run_id: "wr_1", name: "build features", description: null, phases: [{}, {}] }), t)!, /"build features" \(2 phases\)/);
  assert.match(formatEvent(ev({ type: "session.thread_created", session_thread_id: "th", agent_name: "App Developer", workflow_run_id: "wr_1" }), t)!, /App Developer started \(workflow run\)/);
});

test("ignores noise events", () => {
  assert.equal(formatEvent(ev({ type: "span.model_request_start" }), new ThreadNames()), undefined);
});
