# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-29T11:32:12.946Z.

## Overview

Article Recommendation Agent UI that turns a target keyword and client into writer-ready article recommendations, with structured FAQ rendering and print-to-PDF support.

**Repository:** `article-recommendation-ui`  
**File count:** 29

## Features

- Streamed article recommendations from the Arena workflow API
- Structured model-output rendering with sections, badges, sources, and FAQ blocks
- FAQ entries rendered as distinct question/answer blocks with consistent spacing
- Print-this-view PDF export with pagination-safe cards and FAQ items
- Arena email gate with access-denied page and iframe-safe headers

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
- `/access-denied` — `app/access-denied/page.tsx`

## Database Models

- `RecommendationRequest`

## File Inventory

### App pages

- `app/access-denied/page.tsx`
- `app/arena-ds-tokens.css`
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
- `components/arena-email-provider.tsx`

### Libraries

- `lib/arena-email-constants.ts`
- `lib/arena-email.ts`
- `lib/modelOutput.ts`
- `lib/prisma.ts`
- `lib/types.ts`
- `prisma/schema.prisma`

### Config

- `.env.example`
- `middleware.ts`
- `next-env.d.ts`
- `next.config.ts`
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
- `app/access-denied/page.tsx`
- `app/api/generate/route.ts`
- `app/api/recommend/route.ts`
- `app/arena-ds-tokens.css`
- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`
- `components/BriefGeneratorClient.tsx`
- `components/ModelOutputRenderer.tsx`
- `components/RecommendationClient.tsx`
- `components/arena-email-provider.tsx`
- `lib/arena-email-constants.ts`
- `lib/arena-email.ts`
- `lib/modelOutput.ts`
- `lib/prisma.ts`
- `lib/types.ts`
- `middleware.ts`
- `next-env.d.ts`
- `next.config.ts`
- `package.json`
- `postcss.config.mjs`
- `prisma/schema.prisma`
- `tailwind.config.ts`
- `tsconfig.json`

## Latest Change

- **Updated at:** 2026-07-29T11:32:12.946Z
- **Request:** Need to fix the below item:

In the FAQ section, each item currently renders as a single paragraph with the bold 'Q:' label and the answer text running together inline. Please restructure each FAQ entry so the question and answer are visually distinct blocks:

The question (bold, starting with 'Q:') should sit on its own line.
The answer (starting with 'A:') should start on a new line below the question, not inline with it.
Add spacing between the question and its answer (e.g., 8px margin).
Optionally indent the answer slightly (e.g., 16px left margin) so it reads as subordinate to the question above it.
Keep consistent spacing (e.g., 24px margin-bottom) between each full FAQ item.

Apply this to all FAQ items in the section, not just the first one.


Make sure that it wont touch any other existing behavior
