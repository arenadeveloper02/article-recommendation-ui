# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-24T09:58:24.990Z.

## Overview

Article Recommendation Agent UI: turn a target keyword and client into writer-ready article recommendations with streamed model output, section cards, and per-section Visual & Table Opportunities callouts.

**Repository:** `article-recommendation-ui`  
**File count:** 24

## Features

- Streamed article recommendations from a workflow agent
- Defensive model-output parsing into section cards
- Per-section Visual & Table Opportunities callouts keyed to each section's own inline notes
- Q&A/FAQ extraction and Sources list
- Copy to clipboard and PDF download

## Tech Stack

- Next.js ^15.3.3 (App Router)
- React ^19.0.0
- Tailwind CSS v3
- TypeScript
- Prisma + PostgreSQL (Neon on Vercel)

## Infrastructure

- **DATABASE_URL:** set on Vercel when Neon is connected — do not commit real credentials

## Routes & Pages

- `/` — `app/page.tsx`

## Database Models

- `RecommendationRun`

## File Inventory

### App pages

- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`

### API routes

- `app/api/generate/route.ts`
- `app/api/recommend/route.ts`

### Components

- `components/BriefGeneratorClient.tsx`
- `components/ModelOutputRenderer.tsx`
- `components/RecommendationClient.tsx`

### Libraries

- `lib/modelOutput.ts`
- `lib/prisma.ts`
- `lib/types.ts`
- `prisma/schema.prisma`

### Config

- `.env.example`
- `next-env.d.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `postcss.config.mjs`
- `tailwind.config.ts`
- `tsconfig.json`

### Other

- `README.md`
- `REPO_SUMMARY.md`

## Complete File Index

- `.env.example`
- `README.md`
- `REPO_SUMMARY.md`
- `app/api/generate/route.ts`
- `app/api/recommend/route.ts`
- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`
- `components/BriefGeneratorClient.tsx`
- `components/ModelOutputRenderer.tsx`
- `components/RecommendationClient.tsx`
- `lib/modelOutput.ts`
- `lib/prisma.ts`
- `lib/types.ts`
- `next-env.d.ts`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `postcss.config.mjs`
- `prisma/schema.prisma`
- `tailwind.config.ts`
- `tsconfig.json`

## Latest Change

- **Updated at:** 2026-07-24T09:58:24.990Z
- **Request:** === SCOPE LOCK: BUG-FIX-ONLY MODE ===
This is a bug-fix request, not a redesign request. Apply ONLY the fix described below. Do not restyle, reposition, resize, reorder, or refactor anything else in the app, even if you notice other things that look improvable.

=== BUG: "VISUAL / TABLE OPPORTUNITIES" CALLOUT SHOWS THE WRONG SECTION'S SUGGESTION (SYSTEMIC, NOT LIMITED TO ONE HEADING) ===
Observed behavior: under multiple headings throughout the document (not limited to one H3, and not limited to H3-level headings specifically), the inline writing-instructions text states one "Visual / Table Opportunities" suggestion, but the rendered "VISUAL & TABLE OPPORTUNITIES" callout card displayed directly below that heading shows a DIFFERENT suggestion — one that appears to belong to another section elsewhere in the document.

Confirmed example: under the H3 "When to call your dentist after implant surgery," the inline text says:
  "Visual / Table Opportunities: Red-flag callout box."
but the rendered card shows:
  "TABLE — Summarize the comparison points in this section (options, costs, pros/cons) as a scannable table."
This same kind of mismatch (inline text says one thing, rendered card shows another section's suggestion) recurs at other headings in the document too — this is a general, document-wide mapping problem, not a one-off or a heading-level-specific issue.

Expected behavior: for EVERY heading/section in the document, the rendered "VISUAL & TABLE OPPORTUNITIES" card must match the suggestion stated in that same section's own inline "Visual / Table Opportunities:" text — 1:1, every time, regardless of heading level or position in the document.

Likely root cause to investigate: since this happens across multiple sections and heading levels (not isolated to one spot), look for a systemic issue in how "Visual/Table Opportunities" data is associated with sections — e.g.:
  - Suggestions being matched to sections by array/list index rather than by a stable per-section id, so any insertion/reordering/off-by-one shifts every suggestion after it.
  - A shared/global accumulator or blockId being reused or mis-scoped across sections during streaming, causing suggestion data to bleed from one section into another.
  - Section boundaries (headings) and suggestion boundaries being parsed independently and then zipped together assuming they arrive in matching order/count, which breaks if either list is generated with a different number of items or in a different order than expected.
Trace the actual code path that pairs each heading with its "Visual/Table Opportunities" suggestion and fix the association so it's keyed to the correct originating section everywhere in the document, not just the one example above.

Do not change: callout card styling, the "TABLE" badge design, section layout/order, or any other part of the page. Fix only the section-to-suggestion association logic so inline text and rendered card always agree, for every section in the document.


NOTE:
MAKE SURE THAT ITTOUCHES ONLY THEABOVE CHANEGE
