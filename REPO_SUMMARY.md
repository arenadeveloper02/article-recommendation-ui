# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-23T16:05:15.547Z.

## Overview

Article Recommendation Agent with a redesigned UI: labeled form fields, loading and error states, recommendation cards with copy buttons, empty state, and a refine action.

**Repository:** `article-recommendation-ui`  
**File count:** 22

## Features

- Labeled input form with helper text and validation
- Streaming recommendation results rendered as cards
- Copy-to-clipboard per recommendation
- Empty state and Generate more / Refine actions
- Responsive two-column desktop layout

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
- `components/RecommendationClient.tsx`

### Libraries

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
- `components/RecommendationClient.tsx`
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

- **Updated at:** 2026-07-23T16:05:15.547Z
- **Request:** Redesign the UI of this Article Recommendation Agent page (input form + results output) with the following changes. Keep the existing tech stack and functionality intact — this is a visual/UX pass, not a logic rewrite.

INPUT FORM
- Add proper <label> elements above each field (not just placeholder text): "Target Keyword" and "Client".
- Add helper/example text under the Keyword field, e.g. "e.g. best running shoes for flat feet".
- If the list of clients is fixed/known, convert the Client field into a dropdown/autocomplete instead of free text. If it's arbitrary, keep it as text but add a placeholder example.
- Disable the "Get Recommendations" button until both fields have values; show a subtle error state if submitted empty.
- On submit, show a loading state on the button (spinner + "Generating…") and disable it until the response returns.
- Wrap the form in a centered container with max-width ~600-700px, generous padding, and clear vertical spacing between label/input/helper text.
- Use a consistent type scale and an accent color for the primary button (currently looks like default unstyled HTML).

OUTPUT / RESULTS SECTION
- Render each recommendation as a distinct card (border/shadow, rounded corners, padding) instead of plain text — each card should show: article title/angle, target keyword variant, and a short rationale.
- Add a "Copy" button on each card that copies the title (or full recommendation) to clipboard.
- Add an empty state shown before the first search — a short instructional message or example placeholder so the page doesn't look broken.
- Add a "Generate more" / "Refine" action below the results so users can request additional recommendations without resubmitting the form from scratch.
- If any structured metadata exists (search intent, difficulty, volume, etc.), display it as small tags/badges rather than inline prose.

LAYOUT
- On desktop, use a layout where the form sits at the top (or left) and results appear below (or right) in a clean grid — avoid a single unstyled vertical stack.
- Ensure the whole page has consistent spacing, font weights/sizes for headings vs. body text, and a subtle background/foreground contrast (avoid stark black-on-white default browser styling).

Please implement these changes incrementally and preserve all existing data-fetching/submission logic — only touch markup, styling, and client-side UI state (loading, empty state, disabled state).
