# CLAUDE.md

## Project

ldnout — a London events aggregator PWA. Pulls events from configurable London-focused sources into a mobile-first interface with filtering, distance sorting, semantic search, install support, offline support, and optional push notifications.

## Useful Commands

```bash
npm run dev:ui
npm run fetch:all
npm run build:events
npm run typecheck
npm run lint
npm run test:run
```

## London Configuration

Core place metadata lives in `src/config/site.ts`. Change the central point or radius there before tuning fetchers.
