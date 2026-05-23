# ldnout

Discover what's on in London. A PWA that aggregates local events from multiple sources into one clean, mobile-first interface.

## Data Sources

- Skiddle
- Ticketmaster
- Ents24
- Outsavvy
- Eventbrite
- Meetup
- See Tickets
- Dice venue pages, when configured
- iCal feeds

## Features

- Aggregated local events in one place
- Mobile-first PWA, installable and offline-capable
- Semantic search powered by in-browser embeddings
- Optional live music enrichment with Spotify and YouTube artist links
- Netlify serverless functions for notifications

## Development

```bash
npm install
npm run dev:ui
npm run fetch:all
npm run build:events
npm run typecheck && npm run lint && npm run test:run
```

London search defaults to a 10 mile radius from central London. Update `src/config/site.ts` to adjust the centre point or radius.
