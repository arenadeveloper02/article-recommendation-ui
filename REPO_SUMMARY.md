# Repository Summary: article-recommendation-ui

> Auto-maintained by Sim Development. Last updated: 2026-07-29T12:30:07.121Z.

## Overview

Article Recommendation Agent UI with staged progress, rotating tips, and a History view combining in-session runs with remote Arena workflow history.

**Repository:** `article-recommendation-ui`  
**File count:** 30

## Features

- Staged progress with segmented bar and rotating tips
- Realistic runtime estimate during generation
- History tab with session and remote entries
- Read-only view of past recommendations
- Arena email-gated access via middleware

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
- `app/api/history/route.ts`
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
- `app/api/history/route.ts`
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

- **Updated at:** 2026-07-29T12:30:07.121Z
- **Request:** Loading/generating state:


Replace the single static "Connecting to the recommendation agent…" message with a sequence of stage messages tied to what the agent is actually doing (e.g. connecting → researching the client → analyzing keyword demand → scoring topics → drafting briefs).
Add a segmented progress bar — one segment per stage — that fills as each stage completes, instead of one continuous ambiguous bar.
Show a rotating tip/insight relevant to the keyword/client during the wait, instead of a blank progress area.
Replace "Xs elapsed" with a realistic time estimate or range if historical run-time data is available (e.g. "usually takes 90–150s").

Add a "History" section to this Article Recommendation Agent tool. Requirements:

1. Location & trigger: Add a "History" button/tab in the header area (next to or near the title) that toggles between the main "Generator" view and a "History" view.
2. What gets saved: Every time the user clicks "Get Recommendations" and a result is generated, save a history entry containing:
- Target Keyword
- Client / Brand
- Timestamp (date + time of generation)
- The full generated output (the H1, headings, and article recommendations)
3. History view UI:
Show entries as a reverse-chronological list (newest first), each as a card showing: keyword, client, timestamp, and a short preview of the H1/title generated.
Each card should have:
- A "View" button/click action that loads that entry's full output back into the main results view (read-only, non-editable)
If there's no history yet, show an empty state message like "No previous runs yet — generate your first recommendation to see it here."
4. Persistence: Store history using in-memory React state (use useState/array), since browser storage isn't available in this environment. Note in a comment that this resets on page reload, and if the user wants persistence across sessions, they'd need to connect a backend/database.
5. Styling: Match the existing design — same rounded cards, purple/indigo accent color, clean spacing, and typography already used in the tool.

Keep the existing Generator view and functionality fully intact — just add History as an additional view/tab.

History API 

curl -X POST \
  -H "X-API-Key: use the same key " \
  -H "Content-Type: application/json" \
  -d '{"email":"example","type":"example","stream":false","selectedOutputs":["buildhistory.result"]}' \
  Output: 
{
  "result": {
    "history": [
      {
        "id": "2de2100c-304e-4e5b-a628-e7783dd0d87d",
        "email": "hanuvendra.pandey@position2.com",
        "input": {
          "keyword": "Dental implants",
          "client": "42 North Dental",
          "email": "hanuvendra.pandey@position2.com"
        },
        "output": "Longevity varies based on habits, bite forces, and maintenance.\n\n**Reference URLs:**\n- https://my.clevelandclinic.org/health/treatments/10903-dental-implants  \n- https://www.mayoclinic.org/tests-procedures/dental-implant-surgery/about/pac-20384622  \n- https://www.health.harvard.edu/healthy-aging-and-longevity/lost-a-tooth-what-to-know-about-dental-implants  \n- https://www.fda.gov/medical-devices/dental-devices/dental-implants-what-you-should-know  \n- https://www.mouthhealthy.org/all-topics-a-z/implants  \n- https://www.deltadental.com/protect-my-smile/procedures/dental-implant/  \n- https://utswmed.org/medblog/dental-implants-dentist/  \n- https://www.healthdirect.gov.au/dental-implant  \n- https://www.ncbi.nlm.nih.gov/books/NBK470448/  \n- https://en.wikipedia.org/wiki/Dental_implant"
      },
      {
        "id": "f6f05be3-22d5-4083-9ab9-3b364cab076c",
        "email": "hanuvendra.pandey@position2.com",
        "input": {
          "keyword": "Dental Implants",
          "client": "42 North Dental",
          "email": "hanuvendra.pandey@position2.com"
        },
        "output": "**Reference URLs:**\n- https://my.clevelandclinic.org/health/treatments/10903-dental-implants\n- https://www.mayoclinic.org/tests-procedures/dental-implant-surgery/about/pac-20384622\n- https://www.fda.gov/medical-devices/dental-devices/dental-implants-what-you-should-know\n- https://www.health.harvard.edu/healthy-aging-and-longevity/lost-a-tooth-what-to-know-about-dental-implants\n- https://www.healthdirect.gov.au/dental-implant\n- https://www.deltadental.com/protect-my-smile/procedures/dental-implant/\n- https://www.mouthhealthy.org/all-topics-a-z/implants\n- https://utswmed.org/medblog/dental-implants-dentist/\n- https://www.ncbi.nlm.nih.gov/books/NBK470448/\n- https://en.wikipedia.org/wiki/Dental_implant"
      }
    ]
  },
  "stdout": ""
}
https://agent.thearena.ai/api/workflows/38458816-0871-4c2f-8545-39654a5530cc/execute


Older  the API 
Make the streaming false and remove the selectedOutputs
curl -X POST \
  -H "X-API-Key: use the older API key " \
  -H "Content-Type: application/json" \
  -d '{"keyword":"example","client":"example","email":"email from the session","stream":false }' \
  https://agent.thearena.ai/api/workflows/09e8e4e6-4b9c-4126-95f2-cbfcfd025f63/execute
