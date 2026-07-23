# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-23T16:55:31.520Z.

## Overview

Article recommendation agent UI that turns a target keyword and client into writer-ready article recommendations with defensive, structure-aware model output rendering.

**Repository:** `article-recommendation-ui`  
**File count:** 24

## Features

- Streamed article recommendations with live status updates
- Shared defensive model-output renderer (Q&A lists, sections, truncated Sources list)
- Sentinel/control token stripping ([DONE], [END], <|endoftext|>) anywhere in the text
- Sanitized markdown rendering that escapes raw HTML from model output
- Internal scroll panel with visible affordance for long results
- Copy to clipboard and PDF export of recommendations

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

- **Updated at:** 2026-07-23T16:55:31.520Z
- **Request:** The recommendation output is breaking in a few ways when the model returns longer, more variable content (numbered Q&A lists, reference URL lists, etc.):

1. Streaming/completion artifacts are leaking into the rendered content — e.g. a stray "[DONE]" token appearing appended to the last item in a list. Find where the raw model/stream output is parsed and strip any control/completion markers (like [DONE], [END], or similar sentinel tokens) before it's rendered, regardless of where in the text they appear (end of a line, end of a URL, etc.) — not just at the very end of the full response.

2. The output renders as one long unstyled block (plain numbered list + raw hyperlinks) instead of adapting to actual content structure. Make the rendering dynamic based on what the response actually contains, not a fixed template:
   - If the response includes a Q&A/FAQ-style list, render each item as a distinct list entry with the question as a heading and the answer as body text (support italic/emphasis if the model returns markdown).
   - If the response includes reference URLs, render them as a distinct "Sources" section with a bulleted list, each link truncated/ellipsized visually if too long, with the full URL available on hover/title attribute — don't let long raw URLs force horizontal overflow or break the card width.
   - Handle variable-length responses (2 items or 20 items) with consistent spacing — don't let the container's layout depend on a fixed expected item count.

3. Add overflow/scroll handling at the container level: if content is taller than the visible area, the results panel should scroll internally with a clear scroll affordance, instead of the page silently extending or clipping content.

4. Add defensive parsing: if the model output is malformed, partially streamed, or missing an expected section (e.g. no reference URLs returned), render gracefully with a fallback ("No sources returned for this recommendation") instead of breaking layout or showing empty artifacts.

5. Sanitize any markdown/HTML in the model response before rendering (escape raw HTML, safely parse markdown links/bold/italic) so malformed model output can't break the DOM structure.

Please implement this as a shared "render model output" utility/component so any future output section (not just this one) benefits from the same dynamic, defensive rendering.
