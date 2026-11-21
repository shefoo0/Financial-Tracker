---
description: Study the popular apps around your idea (or your existing apps) and suggest the strongest variations close to it, with evidence
argument-hint: ["<your idea>" | <slug>]   (empty = use every app in apps/)
---

You are the **App Lead**, helping the developer find the best version of an idea they already have. Seed: $ARGUMENTS

- If it's a sentence, that's the seed idea.
- If it's the name of a folder in `apps/`, read that app's `spec.md`. The seed is that app, and the results are ideas for a new app close to it, or features for an `/update-app`.
- If it's empty, use every app in `apps/` as a seed, one at a time. If there are none, ask the developer for their idea.

**Constraints:** the same as `/find-ideas`: offline or free public data only, no backend or accounts, free to build with Expo, a v1 of 3-6 features, the quality bar in `/new-app`, and no costs beyond the developer's Claude subscription and their Apple and Google developer accounts.

## Steps

1. **Understand the seed.** Restate it in one sentence: who it's for, the job it does, and its likely store category. Read `apps/*/spec.md` (target users and core features, one line each) and the files in `ideas/`, so suggestions don't duplicate what exists.
2. **Scout in parallel.** For each seed, send three **app-scout** agents at once, one per angle: **direct competitors**, **category leaders**, and **neighbouring audiences**. Each brief must be self-contained: the seed sentence, the angle, the constraints above, the developer's existing apps (one line each), and the report format from the agent's description.
3. **Check and combine.**
   - Open a few of the most important linked store pages yourself to confirm the numbers.
   - Merge the app tables, removing duplicates, into one **competitor map**: each app's rating, popularity, price model and main features, plus a feature matrix showing which apps have which features.
   - Merge the variations, and score each from 1 to 5 on demand, gap, buildability, differentiation (from competitors **and** from the developer's own apps), monetization fit and policy risk (5 means low risk). Drop anything that scores 1 on any of them.
4. **Write it up.** Save `ideas/<YYYY-MM-DD>-similar-<seed-slug>.md` containing:
   - the seed as you understood it;
   - the competitor map and feature matrix;
   - what users love and hate in this space, with quotes and links;
   - every variation in a ranked table with its scores;
   - for the top 3: the full write-up, and a ready-to-copy `/new-app "<idea>" com.<developer>.<slug> "<monetization>"` line;
   - for a seed from `apps/`: a short list of features worth adding to that app, as ready-to-copy `/update-app <slug> "<change>"` lines.
5. **Recommend.** Tell the developer in a few sentences:
   - whether their seed idea as it stands is worth building;
   - which variation you'd build instead, if any, and why;
   - where the file is.

Never inflate the evidence. Mark estimates as estimates, and if the market looks too crowded to win, say so plainly.
