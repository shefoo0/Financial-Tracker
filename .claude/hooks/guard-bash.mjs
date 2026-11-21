#!/usr/bin/env node
// PreToolUse hook for Bash: blocks commands that would cost money, leak
// signing secrets, publish something, or destroy work. Node (not bash + jq)
// so it works the same on Windows, macOS and Linux.
//
// Reads the hook input JSON on stdin; exits 2 with a reason on stderr to block.

import { pathToFileURL } from "node:url";

// Commands that read, copy, move or send a file's contents.
const READERS = "cat|type|less|more|head|tail|cp|mv|scp|rsync|base64|xxd|od|strings|curl|wget|nc|Get-Content|Copy-Item|Move-Item|openssl|keytool\\s+-list|zip|tar";

export const RULES = [
  // Only when eas is run (start of a command, after npx/pnpm dlx/yarn dlx/bunx),
  // not when the words appear in a commit message or file text.
  { re: /(^|[;&|(]\s*|\n\s*|\b(npx|bunx)\s+(--yes\s+|-y\s+)?|\b(pnpm|yarn)\s+(dlx\s+)?)eas(-cli)?(@[\w.]+)?\s+(build|submit|update|credentials|workflow)/i, why: "Cloud builds and submissions (EAS) aren't allowed: build locally and upload yourself (free-only rule)." },
  { re: /\bexpo\s+(publish|upload)\b/i, why: "Publishing through Expo's cloud isn't allowed (free-only rule)." },
  { re: /\bnpm\s+(publish|adduser|login)\b/i, why: "Publishing packages or logging in to npm isn't part of building apps." },
  { re: /\bgit\s+push\b[^|;&]*(--force\b|-f\b|--force-with-lease\b)/i, why: "Force-pushing can destroy work. Push normally, or ask the developer." },
  { re: /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/i, why: "This discards uncommitted work. Ask the developer first." },
  { re: /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(\/|~|\$HOME|\.\.?)(\s|$|\/\s|\/\*)/i, why: "Refusing to recursively delete a root, home or parent directory." },
  // Signing keys: block commands that read, copy or move them. A mention in
  // text (docs, a heredoc that writes a file) is fine.
  { re: new RegExp(`\\b(${READERS})\\b[^\\n|;&]*(\\.app-signing\\b|\\.jks\\b|\\.keystore\\b)`, "i"), why: "Signing keys are handled by the developer in their own terminal; don't read, copy or move them." },
  // ~/.gradle/gradle.properties holds signing passwords (a project's own android/gradle.properties is fine).
  { re: new RegExp(`\\b(${READERS}|grep|sed|awk|rg|findstr|Select-String)\\b[^\\n|;&]*(~|\\$HOME|\\$\\{HOME\\}|%USERPROFILE%|\\$env:USERPROFILE)[/\\\\]\\.gradle[/\\\\]gradle\\.properties`, "i"), why: "~/.gradle/gradle.properties holds signing passwords; don't read or copy it." },
  { re: /\b(security\s+find-generic-password|printenv|env)\b[^\n]*(PASSWORD|TOKEN|SECRET|KEY)/i, why: "Don't print secrets." },
];

export function check(command) {
  for (const r of RULES) {
    if (r.re.test(command) && (!r.test || r.test(command))) return r.why;
  }
  return null;
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let command = "";
  try {
    command = JSON.parse(raw)?.tool_input?.command ?? "";
  } catch {
    return 0; // not our input; never block on a parse problem
  }
  const why = check(command);
  if (why) {
    process.stderr.write(`Blocked by .claude/hooks/guard-bash.mjs: ${why}\n`);
    return 2;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().then((code) => process.exit(code));
