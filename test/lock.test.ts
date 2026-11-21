import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveIds } from "../src/lock.ts";

const lock = {
  resources: {
    "./agents/app-builder/agent.md": { id: "agent_1" },
    "./agents/app-builder/environment.yaml": { id: "env_1" },
    "./agents/app-builder/vault.yaml": { id: "vlt_1" },
  },
};

test("reads ids from the lock file", () => {
  assert.deepEqual(resolveIds(lock, {}), { agentId: "agent_1", environmentId: "env_1", vaultId: "vlt_1" });
});

test("env vars override the lock file", () => {
  const ids = resolveIds(lock, { APP_BUILDER_AGENT_ID: "agent_2" });
  assert.equal(ids.agentId, "agent_2");
  assert.equal(ids.environmentId, "env_1");
});

test("vault is optional, agent and environment are not", () => {
  assert.equal(resolveIds({ resources: { ...lock.resources, "./agents/app-builder/vault.yaml": {} } }, {}).vaultId, undefined);
  assert.throws(() => resolveIds({}, {}), /ant apply/);
});
