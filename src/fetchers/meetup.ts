import type { CmEvent, FetchResult, Fetcher, EventCategory } from '../types.js';
import { makeEventId, normalisePrice, LONDON_LAT, LONDON_LNG } from '../utils.js';

/**
 * Meetup event fetcher.
 * Extracts __NEXT_DATA__ / __APOLLO_STATE__ JSON embedded in the search page HTML.
 * No API key required — public page.
 */

const SEARCH_BASE = 'https://www.meetup.com/find/';

const SEARCH_QUERIES: Array<Record<string, string>> = [
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'twentyFiveMiles' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', categoryId: '546' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'music' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'tech' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'art' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'business' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'social' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'walking' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'language' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'fitness' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'comedy' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'theatre' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'food' },
  { source: 'EVENTS', location: 'gb--17--London', distance: 'tenMiles', keywords: 'startup' },
];

function searchUrl(query: Record<string, string>): string {
  return `${SEARCH_BASE}?${new URLSearchParams(query)}`;
}

interface MeetupVenue {
  __typename?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
}

interface MeetupEvent {
  __typename?: string;
  id: string;
  title: string;
  description?: string;
  dateTime: string;
  eventType?: string;
  eventUrl: string;
  venue?: MeetupVenue | { __ref: string };
  group?: { name?: string; urlname?: string } | { __ref: string };
  featuredEventPhoto?: { __ref: string } | { highResUrl?: string; baseUrl?: string };
  feeSettings?: { amount?: number; currency?: string } | null;
}

function resolveRef(apolloState: Record<string, unknown>, ref: { __ref: string }): unknown {
  return apolloState[ref.__ref] ?? null;
}

function isRef(val: unknown): val is { __ref: string } {
  return typeof val === 'object' && val !== null && '__ref' in val;
}

function mapCategory(groupName: string): EventCategory {
  const lower = groupName.toLowerCase();
  if (lower.includes('tech') || lower.includes('code') || lower.includes('developer'))
    return 'community';
  if (lower.includes('theatre') || lower.includes('comedy') || lower.includes('improv'))
    return 'theatre-comedy';
  if (lower.includes('music') || lower.includes('band') || lower.includes('jam'))
    return 'live-music';
  if (lower.includes('fitness') || lower.includes('run') || lower.includes('yoga'))
    return 'fitness-class';
  if (lower.includes('kids') || lower.includes('family') || lower.includes('parent')) return 'kids';
  if (lower.includes('church') || lower.includes('faith') || lower.includes('prayer'))
    return 'church-faith';
  if (lower.includes('sport') || lower.includes('football') || lower.includes('cricket'))
    return 'sport';
  return 'community';
}

function resolveImageUrl(
  apolloState: Record<string, unknown>,
  photo: MeetupEvent['featuredEventPhoto']
): string | null {
  if (!photo) return null;
  const resolved = isRef(photo)
    ? (resolveRef(apolloState, photo) as Record<string, unknown>)
    : photo;
  if (!resolved) return null;
  return (resolved.highResUrl as string) ?? (resolved.baseUrl as string) ?? null;
}

function parseEvent(apolloState: Record<string, unknown>, ev: MeetupEvent): CmEvent | null {
  // Skip online events
  if (ev.eventType === 'ONLINE') return null;
  if (!ev.id || !ev.title || !ev.dateTime || !ev.eventUrl) return null;

  const startDate = new Date(ev.dateTime);
  if (isNaN(startDate.getTime())) return null;

  // Resolve venue
  let venue: MeetupVenue | null = null;
  if (ev.venue) {
    venue = isRef(ev.venue) ? (resolveRef(apolloState, ev.venue) as MeetupVenue | null) : ev.venue;
  }

  // Resolve group
  let groupName = '';
  if (ev.group) {
    const group = isRef(ev.group)
      ? (resolveRef(apolloState, ev.group) as Record<string, string> | null)
      : ev.group;
    groupName = group?.name ?? '';
  }

  const price = normalisePrice(ev.feeSettings?.amount) ?? 'Free';

  const imageUrl = resolveImageUrl(apolloState, ev.featuredEventPhoto);

  return {
    id: makeEventId('meetup', ev.id),
    title: ev.title.trim(),
    description: ev.description?.slice(0, 300) ?? '',
    startDate,
    endDate: null,
    venue: venue?.name ?? 'London',
    address: venue?.address ?? '',
    category: mapCategory(groupName),
    source: 'meetup',
    sourceUrl: ev.eventUrl,
    latitude: LONDON_LAT,
    longitude: LONDON_LNG,
    imageUrl,
    price,
    promoter: groupName || null,
  };
}

export const meetupFetcher: Fetcher = {
  name: 'meetup',
  async fetch(): Promise<FetchResult> {
    const start = Date.now();
    const errors: string[] = [];
    const allEvents: CmEvent[] = [];
    const seen = new Set<string>();

    try {
      for (const query of SEARCH_QUERIES) {
        const url = searchUrl(query);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        let html = '';
        try {
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'LdnOut/0.1 (London Events Aggregator)',
              Accept: 'text/html',
            },
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (!res.ok) {
            errors.push(
              `Meetup: HTTP ${res.status} for ${query.keywords ?? query.categoryId ?? 'all'}`
            );
            continue;
          }

          html = await res.text();
        } catch (err) {
          clearTimeout(timer);
          errors.push(
            `Meetup ${query.keywords ?? query.categoryId ?? 'all'} fetch error: ${(err as Error).message}`
          );
          continue;
        }

        // Extract __NEXT_DATA__ JSON
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
        if (!match) {
          errors.push(
            `Meetup: no __NEXT_DATA__ found for ${query.keywords ?? query.categoryId ?? 'all'}`
          );
          continue;
        }

        const nextData = JSON.parse(match[1]);

        // Apollo state is nested in page props
        const apolloState: Record<string, unknown> =
          nextData?.props?.pageProps?.__APOLLO_STATE__ ?? {};

        // Find all Event entries in the Apollo cache
        for (const [key, value] of Object.entries(apolloState)) {
          if (!key.startsWith('Event:')) continue;
          const ev = value as MeetupEvent;
          if (ev.__typename !== 'Event') continue;

          try {
            const parsed = parseEvent(apolloState, ev);
            if (parsed && !seen.has(parsed.id)) {
              seen.add(parsed.id);
              allEvents.push(parsed);
            }
          } catch (err) {
            errors.push(`Meetup event parse error (${ev.id ?? key}): ${(err as Error).message}`);
          }
        }
      }

      if (allEvents.length === 0 && errors.length === 0) {
        errors.push('Meetup: 0 events parsed — Apollo state structure may have changed');
      }
    } catch (err) {
      errors.push(`Meetup fetch error: ${(err as Error).message}`);
    }

    return {
      source: 'meetup',
      events: allEvents,
      errors,
      fetchedAt: new Date(),
      durationMs: Date.now() - start,
    };
  },
};
