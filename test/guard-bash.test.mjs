import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { check } from "../.claude/hooks/guard-bash.mjs";

const blocked = [
  "npx eas-cli@latest build --platform all",
  "eas submit -p ios",
  "npx eas credentials",
  "git push --force origin main",
  "git push -f",
  "git reset --hard HEAD~3",
  "git clean -fdx",
  "rm -rf ~",
  "rm -rf /",
  "cat ~/.app-signing/moneyradar-upload.jks",
  "cp ~/.app-signing/x.jks /tmp/",
  "cat ~/.gradle/gradle.properties",
  "grep PASSWORD $HOME/.gradle/gradle.properties",
  "npm publish",
  "printenv | grep TOKEN",
];
const allowed = [
  "npx expo export --platform web",
  "npx expo install expo@^58.0.0",
  "cd android && ./gradlew bundleRelease",
  "git push origin claude/Tester",
  "git status",
  "rm -rf node_modules dist-web",
  "rm -rf ./android",
  "keytool -genkeypair -v -storetype PKCS12 -keystore ~/.app-signing/a-upload.jks -alias upload",
  "jarsigner -verify -verbose -certs app-release.aab",
  "node scripts/store-lookup.mjs search budget --country ae",
  "echo 'android.useAndroidX=true' >> android/gradle.properties",
  "grep -rn targetSdk android/build.gradle android/app/build.gradle android/gradle.properties",
  "git commit -m 'block paid EAS builds and eas submit in the hook'",
  "python3 - <<'EOF'\ntext = 'Ask the developer to add lines to ~/.gradle/gradle.properties and keep ~/.app-signing/x.jks safe'\nEOF",
];

test("still blocks reads written in other ways", () => {
  for (const c of [
    "type %USERPROFILE%\\.gradle\\gradle.properties",
    "Get-Content $env:USERPROFILE/.gradle/gradle.properties",
    "base64 ~/.app-signing/a-upload.jks",
    "keytool -list -keystore ~/.app-signing/a-upload.jks",
    "tar czf keys.tgz ~/.app-signing",
    "cd apps/x && eas build -p android",
    "npx --yes eas-cli@latest submit",
    "pnpm dlx eas-cli build",
    "yarn eas build",
  ]) assert.ok(check(c), `should block: ${c}`);
});

test("blocks costly, destructive and secret-leaking commands", () => {
  for (const c of blocked) assert.ok(check(c), `should block: ${c}`);
});

test("allows normal build and research commands", () => {
  for (const c of allowed) assert.equal(check(c), null, `should allow: ${c}`);
});

test("as a hook: exit 2 with a reason, or exit 0", () => {
  const run = (input) => spawnSync("node", [".claude/hooks/guard-bash.mjs"], { input, encoding: "utf8" });
  const bad = run(JSON.stringify({ tool_name: "Bash", tool_input: { command: "eas build" } }));
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /free-only rule/);
  assert.equal(run(JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } })).status, 0);
  assert.equal(run("not json").status, 0);
});
