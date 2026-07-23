# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-23T16:29:26.951Z.

## Overview

Turn a target keyword and client into writer-ready article recommendations, with streaming results and a client-side PDF export of the recommendation cards.

**Repository:** `article-recommendation-ui`  
**File count:** 22

## Features

- Keyword + client input form with validation
- Streaming recommendation generation via SSE
- Parsed recommendation cards with intent/difficulty/volume badges
- Copy-to-clipboard per recommendation
- Download as PDF export (jsPDF, client-side) of all displayed recommendations
- Markdown rendering with GFM support

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

- **Updated at:** 2026-07-23T16:29:26.951Z
- **Request:** Add a "Download as PDF" option to the results section of this app.

Requirements:
1. Add a "Download as PDF" button near the top of the results area (visible once recommendations are loaded — hide it in the empty state).
2. Clicking it should generate a clean, readable PDF containing all currently displayed recommendation cards: for each one, include the title, intent tag, rationale, and the meta info (difficulty, search volume, word count).
3. The PDF should be nicely formatted for a writer/client to read — not a raw screenshot of the UI. Use a simple layout: a header with the keyword/client the brief was generated for, then each recommendation as its own clearly separated block with a heading and body text. Strip out interactive-only elements (buttons, hover states) from the PDF output.
4. Use a client-side library (e.g. jsPDF, or html2pdf.js if a closer visual match to the on-screen cards is preferred) so no backend/server changes are required — add via CDN script tag if not already installed.
5. Name the downloaded file something like article-recommendations-[keyword]-[client].pdf (sanitize the keyword/client for filesystem-safe characters, lowercase, hyphens instead of spaces).
6. Handle the case where the button is clicked with zero recommendations loaded (disable it, or no-op).

Show me the code changes needed, including the CDN import and the generation function.
