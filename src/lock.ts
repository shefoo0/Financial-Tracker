import { readFileSync } from "node:fs";

// `ant apply` records the ID of each resource it manages in claude-lock.json,
// keyed by the file's path. Environment variables override the lock file.
const RESOURCES = {
  agent: { path: "./agents/app-builder/agent.md", env: "APP_BUILDER_AGENT_ID" },
  environment: { path: "./agents/app-builder/environment.yaml", env: "APP_BUILDER_ENV_ID" },
  vault: { path: "./agents/app-builder/vault.yaml", env: "APP_BUILDER_VAULT_ID" },
} as const;

export interface ResourceIds {
  agentId: string;
  environmentId: string;
  vaultId?: string;
}

type Lock = { resources?: Record<string, { id?: string }> };

export function resolveIds(lock: Lock, env: NodeJS.ProcessEnv = process.env): ResourceIds {
  const pick = (k: keyof typeof RESOURCES) => env[RESOURCES[k].env] || lock.resources?.[RESOURCES[k].path]?.id;
  const agentId = pick("agent");
  const environmentId = pick("environment");
  if (!agentId || !environmentId) {
    throw new Error(
      "No agent/environment IDs found. Run `ant apply agents/app-builder` first (see README), " +
        "or set APP_BUILDER_AGENT_ID and APP_BUILDER_ENV_ID.",
    );
  }
  return { agentId, environmentId, vaultId: pick("vault") };
}

export function loadIds(lockPath = "claude-lock.json"): ResourceIds {
  let lock: Lock = {};
  try {
    lock = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return resolveIds(lock);
}
