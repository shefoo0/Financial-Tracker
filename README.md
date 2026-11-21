# App Factory

A team of [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) that takes an app idea and turns it into a store-ready **Expo (React Native)** project for iOS and Android. A master agent plans the app and hands the work to sub-agents:

| Agent | Model | Job |
| --- | --- | --- |
| **App Lead** (master) | Claude Opus 5.5 | Researches competitors, writes the spec and task list, scaffolds the project, hands out tasks, checks the reports, writes the store listing, packages everything |
| **App Developer** | Claude Sonnet 5.5 | Builds one feature or screen. Several run in parallel on separate files. |
| **Code Reviewer** | Claude Sonnet 5.5 | Read-only review for bugs, gaps against the spec and store-rejection risks, with `file:line` evidence |
| **Test Engineer** | Claude Sonnet 5.5 | Writes Jest tests and runs the type checker, linter, `expo-doctor`, tests and bundle exports. It doesn't touch app code. |
| **QC Inspector** | Claude Sonnet 5.5 | Final pass or fail against the store guidelines, listing limits, privacy answers versus the code, and leftover placeholders |

How one run goes:

1. **Plan:** the Lead writes the spec.
2. **Build:** Developers build the features in parallel.
3. **Check:** the Reviewer and the Test Engineer check each feature. The Lead sends real findings back to a Developer, for up to three rounds.
4. **Store material:** the Lead writes the listing and privacy policy.
5. **QC:** the QC Inspector has to pass the app.
6. **Package:** the Lead packages everything and queues EAS builds if you've given it an Expo token.

All the agents share one sandbox and project folder. For apps with more than four features, the Lead starts a **workflow run** that builds and reviews every feature in parallel in the background. A separate grader then checks the finished result against a rubric (`src/outcome.ts`). **You submit to the stores yourself.** No agent does.

## About the stores

Apple (guidelines 4.2 and 4.3) and Google Play (repetitive-content and minimum-functionality policies) reject apps that are templated, thin or copies, and accounts that keep submitting them get terminated. This tool is set up to build *fewer, distinct* apps. It is not a way to flood the stores. Test each app on a real device and read its `REPORT.md` before you submit it.

## Prerequisites

- Node.js 20+
- An Anthropic API account with Managed Agents access, plus the [`ant` CLI](https://github.com/anthropics/anthropic-cli/releases) 1.40+ (needed because the master agent refers to its sub-agents by file path)
- To publish: an Apple Developer Program membership ($99/year) and a Google Play developer account ($25 one-time)
- For cloud builds: a free [Expo](https://expo.dev) account

## Setup (once)

```sh
npm install
ant auth login                                   # or export ANTHROPIC_API_KEY=...

# Create the five agents, the sandbox environment and a vault. `agents/app-builder`
# holds the App Lead; ant apply also creates the sub-agents it lists. Review the plan first:
ant apply --dry-run -v agents/app-builder
ant apply agents/app-builder                     # writes claude-lock.json: commit it
```

To change an agent's instructions or tools, edit its `agents/<name>/agent.md` and run `ant apply agents/app-builder` again. Each change creates a new agent version, and the App Lead is updated to point at it.

Workflow runs are on. To turn them off, change `workflows:` in `agents/app-builder/agent.md` to `{type: disabled}` and re-apply. The Lead will then delegate only to individual sub-agents.

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
| `--budget` | `40` | hard spend cap for the whole team in USD. The session pauses when it hits the cap. |
| `--max-iterations` | `4` | grader revision rounds (1-20) |
| `--out` | `output` | where to download deliverables |

The script streams progress, including each brief the Lead sends, each report it gets back, workflow runs and grader verdicts. It also prints links to watch the session in the Console or attach with `ant beta:sessions connect <id>`. If any agent wants to run a command that the server's safety check flags as uncertain, you're asked to approve it, with the agent's name. With no terminal attached, the answer is always no.

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

You pay for model tokens (App Lead on Claude Opus 5.5 at $4 / $20 per million input / output tokens, sub-agents on Claude Sonnet 5.5 at $2 / $10), web searches ($10 per 1,000) and session runtime ($0.08 per hour). Every sub-agent and every agent in a workflow run uses tokens, so a team run costs more than a single agent would. `--budget` caps the total for all of them in one session. Managed Agents is in beta, and sessions are kept until you delete them.

## Development

```sh
npm run typecheck
npm test
```

| Path | Purpose |
| --- | --- |
| `agents/app-builder/agent.md` | App Lead: config (frontmatter, including the sub-agent roster) and system prompt (body) |
| `agents/{app-developer,code-reviewer,test-engineer,qc-inspector}/agent.md` | the sub-agents |
| `agents/app-builder/environment.yaml` | sandbox networking |
| `agents/app-builder/vault.yaml` | vault for `EXPO_TOKEN` (the credential is added separately) |
| `src/new-app.ts` | starts a session, streams events, asks you about flagged tool calls, downloads outputs |
| `src/events.ts` | formats the team's progress for the terminal |
| `src/outcome.ts` | task description and grader rubric |
