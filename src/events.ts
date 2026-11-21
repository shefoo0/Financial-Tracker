// Turns session events into progress lines for the terminal. The session
// stream shows the App Lead's own work plus a condensed view of its team:
// threads starting and finishing, briefs sent, reports received, workflow runs.

import type Anthropic from "@anthropic-ai/sdk";

export type StreamEvent = Anthropic.Beta.Sessions.BetaManagedAgentsStreamSessionEvents;

// Maps thread IDs to agent names so tool approvals can say who is asking.
export class ThreadNames {
  private names = new Map<string, string>();
  remember(event: StreamEvent) {
    if (event.type === "session.thread_created") this.names.set(event.session_thread_id, event.agent_name);
  }
  nameOf(threadId: string | null | undefined): string {
    return (threadId && this.names.get(threadId)) || "App Lead";
  }
}

type TextLike = { type: string; text?: string };

function firstLine(content: TextLike[], max = 160): string {
  const text = content.map((b) => (b.type === "text" ? b.text ?? "" : "")).join(" ").trim();
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// Returns the text to print for an event, or undefined to print nothing.
// Tool approvals are handled separately, by the caller.
export function formatEvent(event: StreamEvent, threads: ThreadNames): string | undefined {
  switch (event.type) {
    case "agent.message": {
      const text = event.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return text ? `${text}\n` : undefined;
    }
    case "agent.tool_use":
    case "agent.mcp_tool_use":
      return `  · ${event.name}\n`;
    case "session.thread_created":
      return `\n▶ ${event.agent_name} started${event.workflow_run_id ? " (workflow run)" : ""}\n`;
    case "agent.thread_message_sent":
      return `→ brief to ${event.to_agent_name ?? threads.nameOf(event.to_session_thread_id)}: ${firstLine(event.content)}\n`;
    case "agent.thread_message_received":
      return `← report from ${event.from_agent_name ?? threads.nameOf(event.from_session_thread_id)}: ${firstLine(event.content)}\n`;
    case "workflow_run.created":
      return `\n⇉ Workflow run "${event.name}" (${event.phases.length} phase${event.phases.length === 1 ? "" : "s"})\n`;
    case "workflow_run.status_ended":
      return `⇉ Workflow run ended: ${event.result.type}\n`;
    case "workflow_run.error":
      return `⇉ Workflow run error: ${event.error.type}: ${event.error.message}\n`;
    case "span.outcome_evaluation_start":
      return `\n=== Grading iteration ${event.iteration + 1} ===\n`;
    case "span.outcome_evaluation_end":
      return `=== Grader: ${event.result} ===\n${event.explanation}\n\n`;
    case "session.error":
      return `\n[session error] ${JSON.stringify(event.error)}\n`;
    default:
      return undefined;
  }
}
