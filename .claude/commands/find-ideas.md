---
description: Research the App Store and Google Play for app ideas with real demand and a gap the developer can fill, using parallel market-researcher sub-agents
argument-hint: '[topic, audience or category; optional]'
---

You are the **App Lead**, looking for the next app to build. Focus: $ARGUMENTS (if empty, look broadly across categories where a solo developer can compete).

**Constraints for every idea:** it works offline or with only free public data, needs no backend or accounts, is free to build with Expo, has a v1 of 3-6 features, and passes the quality bar in `/new-app` (not thin, not a copy, no trademarks). Nothing may cost money beyond the developer's Claude subscription and their Apple and Google developer accounts.

## Store data

Use the developer's store country from the **Developer profile** in `CLAUDE.md`, plus the US store for the global picture. Researchers get real numbers from `node scripts/store-lookup.mjs`; put the country in every brief. When you check their evidence, run the script yourself on the 2-3 apps that matter most. If the stores can't be reached, say so in the write-up, and mark the numbers as estimates.

## Steps

1. **Know what exists.** List `apps/*/spec.md` and read each target user and core features, plus any earlier files in `ideas/`. New ideas must be clearly different. Apple's spam rule (4.3) also covers one developer publishing many similar apps.
2. **Pick niches.** Choose 4-6 specific niches inside the focus: a category plus an audience or a problem, for example "budgeting for students" or "rota planning for shift workers", not just "finance". Favour niches where users pay or rate apps well, and where the leaders look dated, ad-heavy or overpriced.
3. **Research in parallel.** Send one **market-researcher** per niche, all at once. Each brief must be self-contained: the niche, the constraints above, the existing app ideas to avoid (one line each), and the report format from the agent's description.
4. **Check and score.** Check the strongest evidence yourself (open a couple of the linked store pages). Then score each idea from 1 to 5 on:
   - **Demand:** are people clearly using and paying for apps like this?
   - **Gap:** is there a specific, repeated complaint this app fixes (from 1-3 star reviews)?
   - **Love:** do we know what users love in the leaders (from 5-star reviews), and can this app match it?
   - **Buildability:** can it be built well within the constraints?
   - **Differentiation:** is it clearly different from the leaders and from the developer's own apps?
   - **Monetization fit:** will this audience pay in the chosen way?
   - **Policy risk:** 5 means low risk.

   Drop any idea that scores 1 on anything.
5. **Write it up.** Save `ideas/<YYYY-MM-DD>-<focus-slug>.md` containing:
   - a ranked table of every idea with its scores and total;
   - for the top 3-5: the idea, the evidence with links, the gap, v1 features, monetization, the risks, and a ready-to-copy line: `/new-app "<idea in one sentence>" com.<developer>.<slug> "<monetization>"` (leave `<developer>` for the developer to fill in);
   - the niches that had no good opening, and why.
6. **Recommend one.** Tell the developer which idea you'd build first and why, in a few sentences, and where the file is.

Never inflate the evidence. If the research is thin or the numbers are estimates, say so.
