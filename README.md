# App Factory

A [Claude Managed Agent](https://platform.claude.com/docs/en/managed-agents/overview) that takes an app idea and turns it into a store-ready **Expo (React Native)** project for iOS and Android. For each idea it:

1. checks the App Store and Google Play for competitors and writes a short spec with the gap this app fills;
2. builds the app (TypeScript, Expo Router, offline-first, light and dark mode, accessible);
3. runs the type checker, linter, `expo-doctor`, Jest tests and both platform bundle exports;
4. writes the store listing (within each store's character limits), privacy policy and privacy answers, and makes the icons;
5. queues EAS production builds (`.ipa` / `.aab`) if you've given it an Expo token.

A separate grader checks every iteration against a rubric (`src/outcome.ts`). The agent keeps revising until the grader passes it or it runs out of iterations. **You submit to the stores yourself.** The agent never does.

## About the stores

Apple (guidelines 4.2 and 4.3) and Google Play (repetitive-content and minimum-functionality policies) reject apps that are templated, thin or copies, and accounts that keep submitting them get terminated. This tool is set up to build *fewer, distinct* apps. It is not a way to flood the stores. Test each app on a real device and read its `REPORT.md` before you submit it.

## Prerequisites

- Node.js 20+
- An Anthropic API account with Managed Agents access, plus the [`ant` CLI](https://github.com/anthropics/anthropic-cli/releases) 1.34+
- To publish: an Apple Developer Program membership ($99/year) and a Google Play developer account ($25 one-time)
- For cloud builds: a free [Expo](https://expo.dev) account

## Setup (once)

```sh
npm install
ant auth login                                   # or export ANTHROPIC_API_KEY=...

# Create the agent, its sandbox environment and a vault. Review the plan first:
ant apply --dry-run -v agents/app-builder
ant apply agents/app-builder                     # writes claude-lock.json: commit it
```

To change the agent's instructions or tools, edit `agents/app-builder/agent.md` and run `ant apply agents/app-builder` again. Each change creates a new agent version.

### Optional: EAS cloud builds

These steps let the agent queue the iOS and Android production builds. You don't need a Mac.

1. Create an access token at expo.dev → Account settings → Access tokens.
2. Store it in the vault. The sandbox only ever sees a placeholder, and the real token is added to requests to Expo's servers on the way out:

   ```sh
   read -rs EXPO_TOKEN    # paste the token, then press Enter
   VAULT_ID=$(jq -r '.resources["./agents/app-builder/vault.yaml"].id' claude-lock.json)
   ant beta:vaults:credentials create --vault-id "$VAULT_ID" <<YAML
   display_name: Expo access token
   auth:
     type: environment_variable
     secret_name: EXPO_TOKEN
     secret_value: "$EXPO_TOKEN"
     networking: {type: limited, allowed_hosts: [api.expo.dev, expo.dev]}
     injection_location: {header: true, body: false}
   YAML
   unset EXPO_TOKEN
   ```

3. Set up signing credentials on EAS **once per app**. The agent runs builds non-interactively and won't create credentials itself. EAS can generate an Android keystore automatically. iOS needs an App Store Connect API key or one interactive `npx eas-cli credentials` run on your own machine. If a build fails on credentials, `REPORT.md` gives you the exact command to run.

If an EAS step fails with a blocked network host, add that host to `allowed_hosts` in `agents/app-builder/environment.yaml` (and to the credential's `allowed_hosts` if the token has to reach it), then re-apply.

## Building an app

```sh
npm run new-app -- "Offline habit tracker for rotating shift workers" \
  --bundle-id com.yourname.shifthabits \
  --monetization "freemium: free core, \$1.99/mo for stats and widgets" \
  --budget 25
```

| Option | Default | |
| --- | --- | --- |
| `--bundle-id` | `com.example.<slug>` (flagged in the report) | iOS bundle ID and Android package |
| `--monetization` | the agent picks one and justifies it | free / paid / freemium (in-app purchases go through RevenueCat) |
| `--notes` | | anything else the agent should know |
| `--budget` | `20` | hard spend cap for the session in USD. The session pauses when it hits the cap. |
| `--max-iterations` | `4` | grader revision rounds (1-20) |
| `--out` | `output` | where to download deliverables |

The script streams progress, shows each grader verdict and prints links to watch the session in the Console or attach with `ant beta:sessions connect <id>`. If the agent wants to run a command that the server's safety check flags as uncertain, you're asked to approve it. With no terminal attached, the answer is always no.

When it finishes, the deliverables are in `output/<session-id>/`:

- `<slug>.tar.gz`: the Expo project
- `REPORT.md`: what was built, test results, build links, assumptions, and a **Before you submit** checklist
- `spec.md`, `store/listing.md`, `store/privacy-policy.md`, the icon PNGs

## Submitting

1. Unpack the project, run `npm install`, then try it on real devices (`npx expo start`, or install the EAS build).
2. Take screenshots on a simulator or device in the sizes each store asks for.
3. Create the app record in App Store Connect and the Play Console, set up any in-app products, and paste in the listing from `store/listing.md`.
4. Upload with `npx eas-cli submit --platform ios` and `npx eas-cli submit --platform android`, or upload manually.

## Costs and data

You pay for model tokens (Claude Opus 5.5 at $4 / $20 per million input / output tokens), web searches ($10 per 1,000) and session runtime ($0.08 per hour). `--budget` caps the total for each session. Managed Agents is in beta, and sessions are kept until you delete them.

## Development

```sh
npm run typecheck
npm test
```

| Path | Purpose |
| --- | --- |
| `agents/app-builder/agent.md` | agent config (frontmatter) and system prompt (body), synced by `ant apply` |
| `agents/app-builder/environment.yaml` | sandbox networking |
| `agents/app-builder/vault.yaml` | vault for `EXPO_TOKEN` (the credential is added separately) |
| `src/new-app.ts` | starts a session, streams events, downloads outputs |
| `src/outcome.ts` | task description and grader rubric |
