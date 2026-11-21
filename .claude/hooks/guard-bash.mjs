#!/usr/bin/env node
// PreToolUse hook for Bash: blocks commands that would cost money, leak
// signing secrets, publish something, or destroy work. Expo's free cloud
// plan is allowed for iOS builds and uploads only. Node (not bash + jq)
// so it works the same on Windows, macOS and Linux.
//
// Reads the hook input JSON on stdin; exits 2 with a reason on stderr to block.

import { pathToFileURL } from "node:url";

// Commands that read, copy, move or send a file's contents.
const READERS = "cat|type|less|more|head|tail|cp|mv|scp|rsync|base64|xxd|od|strings|curl|wget|nc|Get-Content|Copy-Item|Move-Item|openssl|keytool\\s+-list|zip|tar";

// An eas command being run: at the start of a command, or after npx, bunx,
// pnpm dlx or yarn (dlx). Words in a commit message or file text don't count.
const EAS_RUN = /(?:^|[;&|(]\s*|\n\s*|\b(?:npx|bunx)\s+(?:--yes\s+|-y\s+)?|\b(?:pnpm|yarn)\s+(?:dlx\s+)?)eas(?:-cli)?(?:@[\w.]+)?\s+([\w:-]+)([^\n;&|]*)/gi;

// Expo's free plan (no payment method) is allowed for iOS only, because iOS
// needs macOS to build and the developer has no Mac. Android stays local and
// free with Android Studio.
const EAS_IOS_ONLY = new Set(["build", "submit", "credentials", "build:run", "build:resign"]);
const EAS_NEVER = /^(update|workflow|workflow:\w+|branch|channel|deploy|env|webhook|account:\w+|upgrade)$/i;

export function checkEas(command) {
  for (const m of command.matchAll(EAS_RUN)) {
    const sub = m[1].toLowerCase();
    const args = m[2];
    if (EAS_NEVER.test(sub)) {
      return `"eas ${sub}" isn't part of the free iOS route. Only iOS builds, submissions and credentials on Expo's free plan are allowed.`;
    }
    if (/--priority\b/i.test(args)) return "Build priority is a paid Expo feature. Use the free queue.";
    if (EAS_IOS_ONLY.has(sub)) {
      const platform = /(?:^|\s)(?:-p|--platform)(?:\s+|=)(\w+)/i.exec(args)?.[1]?.toLowerCase();
      if (platform !== "ios") {
        return `Expo's cloud is only for iOS (no Mac to build it on). Add "--platform ios"; Android builds stay local with Android Studio (free).`;
      }
    }
  }
  return null;
}

export const RULES = [
  { re: EAS_RUN, test: (c) => checkEas(c) !== null, why: null },
  { re: /\bexpo\s+(publish|upload)\b/i, why: "Publishing through Expo's cloud isn't allowed (free-only rule)." },
  { re: /\bnpm\s+(publish|adduser|login)\b/i, why: "Publishing packages or logging in to npm isn't part of building apps." },
  { re: /\bgit\s+push\b[^|;&]*(--force\b|-f\b|--force-with-lease\b)/i, why: "Force-pushing can destroy work. Push normally, or ask the developer." },
  { re: /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/i, why: "This discards uncommitted work. Ask the developer first." },
  { re: /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(\/|~|\$HOME|\.\.?)(\s|$|\/\s|\/\*)/i, why: "Refusing to recursively delete a root, home or parent directory." },
  // Signing keys: block commands that read, copy or move them. A mention in
  // text (docs, a heredoc that writes a file) is fine.
  { re: new RegExp(`\\b(${READERS})\\b[^\\n|;&]*(\\.app-signing\\b|\\.jks\\b|\\.keystore\\b|\\.p8\\b|\\.p12\\b|\\.mobileprovision\\b)`, "i"), why: "Signing keys and Apple API keys are handled by the developer in their own terminal; don't read, copy or move them." },
  // ~/.gradle/gradle.properties holds signing passwords (a project's own android/gradle.properties is fine).
  { re: new RegExp(`\\b(${READERS}|grep|sed|awk|rg|findstr|Select-String)\\b[^\\n|;&]*(~|\\$HOME|\\$\\{HOME\\}|%USERPROFILE%|\\$env:USERPROFILE)[/\\\\]\\.gradle[/\\\\]gradle\\.properties`, "i"), why: "~/.gradle/gradle.properties holds signing passwords; don't read or copy it." },
  { re: /\b(security\s+find-generic-password|printenv|env)\b[^\n]*(PASSWORD|TOKEN|SECRET|KEY)/i, why: "Don't print secrets." },
];

export function check(command) {
  const eas = checkEas(command);
  if (eas) return eas;
  for (const r of RULES) {
    if (r.why === null) continue; // the eas rule, handled above
    r.re.lastIndex = 0;
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
