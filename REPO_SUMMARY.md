# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-29T10:56:07.075Z.

## Overview

Web UI that turns a target keyword and client into writer-ready article recommendations (including a structured FAQ section) with a print-faithful Download PDF feature that reuses the exact on-screen DOM via a dedicated @media print stylesheet.

**Repository:** `article-recommendation-ui`  
**File count:** 29

## Features

- Keyword + client recommendation form with streamed model output
- Adaptive model-output renderer (sections, badges, sources, visual/table opportunities)
- Semantic FAQ blocks (.faq-item / .faq-question / .faq-answer) with question and answer on separate lines
- Print-this-view PDF export: A4 page, embedded Poppins fonts, page-break-inside: avoid on cards, table rows and FAQ items
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

- **Updated at:** 2026-07-29T10:56:07.075Z
- **Request:** My app renders keyword recommendation results (including an FAQ section) in a web UI, and I have a "Download PDF" feature. Currently the PDF looks broken compared to the UI — bad spacing, missing fonts, broken cards/tables — and specifically the FAQ section renders each Q&A as a single run-on paragraph (bold question inline immediately followed by the answer), which is cramped and hard to scan in both the UI and the PDF.

Please fix both:

1. General PDF fidelity

Reuse the exact same HTML/CSS component that renders the UI for PDF generation, instead of a separate PDF template — the goal is "print this view," not "generate new markup."
Add a dedicated @media print stylesheet that:
Fixes container widths (no vw/viewport-relative widths) so cards and tables don't overflow or clip.
Sets page-break-inside: avoid on cards, table rows, and any block that shouldn't split across pages.
Converts flex/grid layouts that don't render well in the PDF engine into simpler block/table layouts if needed.
Removes UI-only elements (buttons, hover states, tooltips, scrollbars).
Explicitly embeds the same fonts and icon sets used in the UI (base64 or @font-face with bundled files) so the PDF doesn't fall back to default system fonts.
If using a headless-browser renderer (Puppeteer/Playwright), wait for all fonts, images, and dynamic content to fully load (waitUntil: 'networkidle0' or an explicit "ready" signal) before generating the PDF.
Set a fixed page size (A4/Letter) and margins, and test long content (keyword lists, FAQ sections) for correct pagination, with headers repeating if tables span multiple pages.

2. FAQ section formatting

Restructure each FAQ item into a distinct block:
Question on its own line, bold, font-weight ~500, 15-16px.
Answer on the next line (not inline), normal weight, margin-top: 4-6px.
Clear separation between items — margin-bottom: 16-20px and/or a subtle divider line.
Use semantic structure: wrap each Q&A in a <div class="faq-item">, with <p class="faq-question"> and <p class="faq-answer"> (or similar) so both the UI stylesheet and the print stylesheet can target them independently.
Add page-break-inside: avoid on .faq-item so a question and its answer never split across a PDF page break, and make sure the same typography/spacing applies in @media print as on screen.
Keep line-height 1.5-1.6 on answers and avoid full-bleed text width for readability.

Show me the updated HTML/CSS for one FAQ item plus the print stylesheet changes so I can review before applying across the full app.
