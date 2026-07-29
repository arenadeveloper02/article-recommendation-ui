# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-29T11:15:31.284Z.

## Overview

Article Recommendation Agent UI that turns a target keyword and client into writer-ready article recommendations, with structured FAQ formatting and a print-ready PDF view.

**Repository:** `article-recommendation-ui`  
**File count:** 29

## Features

- Streamed article recommendations from the Arena workflow
- Semantic FAQ blocks with question/answer separation and print-safe page breaks
- Widened, responsive main content container (max-w-6xl)
- Print-this-view PDF export with dedicated @media print stylesheet
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

- `RecommendationRun`

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

- **Updated at:** 2026-07-29T11:15:31.284Z
- **Request:** Need to fix the below 2 items: 

1.  FAQ section formatting

Restructure each FAQ item into a distinct block:
Question on its own line, bold, font-weight ~500, 15-16px.
Answer on the next line (not inline), normal weight, margin-top: 4-6px.
Clear separation between items — margin-bottom: 16-20px and/or a subtle divider line.
Use semantic structure: wrap each Q&A in a <div class="faq-item">, with <p class="faq-question"> and <p class="faq-answer"> (or similar) so both the UI stylesheet and the print stylesheet can target them independently.
Add page-break-inside: avoid on .faq-item so a question and its answer never split across a PDF page break, and make sure the same typography/spacing applies in @media print as on screen.
Keep line-height 1.5-1.6 on answers and avoid full-bleed text width for readability.



2. 
On the Article Recommendation Agent page, the main content (title, input form, and results card) is currently centered in a narrow fixed-width container, leaving large empty gray margins on the left and right sides of the screen. Please increase the width of this container without changing anything else about the design.

Requirements:

Increase the container's max-width from its current value (appears to be ~750-800px) to approximately 1100-1200px, so it better fills the available screen width.
Keep the container horizontally centered.
Do NOT change: font sizes, input field heights, button sizes/colors, card padding, border-radius, spacing between the title/subtitle/form, or the layout structure of any component.
Keep the top navigation bar ('Agents > Article Recommendation Agent') and the right-side floating toolbar icons exactly where they are — only the main content container should widen.
Make sure this stays responsive: on smaller screens (below ~1024px), the container should still shrink/behave as it currently does so nothing breaks or overflows.
