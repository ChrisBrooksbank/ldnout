/* eslint-disable no-console */
process.env.TZ = 'Europe/London';
import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CmEvent } from './types.js';
import { aggregateEvents } from './aggregator.js';
import { enrichEvents } from './enrichment.js';
import { generateEmbeddings } from './embeddings/generate.js';
import { SITE_CONFIG } from './config/site.js';

/** CmEvent with Date fields serialised as ISO strings for JSON consumption */
export interface SerializedCmEvent extends Omit<CmEvent, 'startDate' | 'endDate'> {
  startDate: string;
  endDate: string | null;
}

export interface EventsJson {
  fetchedAt: string;
  totalEvents: number;
  sourceSummary: Record<string, number>;
  warnings: string[];
  events: SerializedCmEvent[];
}

function serializeEvent(ev: CmEvent): SerializedCmEvent {
  return {
    ...ev,
    startDate: ev.startDate.toISOString(),
    endDate: ev.endDate ? ev.endDate.toISOString() : null,
  };
}

const DEFAULT_OUTPUT = join(process.cwd(), 'public', 'events.json');

const MIN_EXPECTED_EVENTS = Number(process.env.MIN_EXPECTED_EVENTS ?? 100);
const MIN_EXPECTED_SOURCES = Number(process.env.MIN_EXPECTED_SOURCES ?? 2);
const MAX_DISTANCE_FROM_CENTRE_MILES = Number(process.env.MAX_DISTANCE_FROM_CENTRE_MILES ?? 35);

function sourceSummary(events: CmEvent[]): Record<string, number> {
  return events.reduce<Record<string, number>>((summary, event) => {
    summary[event.source] = (summary[event.source] ?? 0) + 1;
    return summary;
  }, {});
}

function distanceMiles(latitude: number, longitude: number): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const from = SITE_CONFIG.centre;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(latitude);
  const deltaLat = toRadians(latitude - from.latitude);
  const deltaLon = toRadians(longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildWarnings(events: CmEvent[], summary: Record<string, number>): string[] {
  const warnings: string[] = [];
  const activeSources = Object.values(summary).filter(count => count > 0).length;

  if (events.length < MIN_EXPECTED_EVENTS) {
    warnings.push(
      `Only ${events.length} events loaded; expected at least ${MIN_EXPECTED_EVENTS} for London.`
    );
  }

  if (activeSources < MIN_EXPECTED_SOURCES) {
    warnings.push(
      `Only ${activeSources} source${activeSources === 1 ? '' : 's'} contributed events; expected at least ${MIN_EXPECTED_SOURCES}.`
    );
  }

  const chelmsfordMatches = events.filter(event =>
    `${event.title} ${event.description} ${event.venue} ${event.address}`
      .toLowerCase()
      .match(/\bchelmsford\b|\bessex\b|\bcm\d{1,2}\b/)
  );
  if (chelmsfordMatches.length > 0) {
    warnings.push(`${chelmsfordMatches.length} events mention Chelmsford/Essex/CM postcodes.`);
  }

  const distantEvents = events.filter(
    event =>
      Number.isFinite(event.latitude) &&
      Number.isFinite(event.longitude) &&
      distanceMiles(event.latitude as number, event.longitude as number) >
        MAX_DISTANCE_FROM_CENTRE_MILES
  );
  if (distantEvents.length > 0) {
    warnings.push(
      `${distantEvents.length} geocoded events are more than ${MAX_DISTANCE_FROM_CENTRE_MILES} miles from central London.`
    );
  }

  return warnings;
}

export async function buildEventsJson(outputPath: string = DEFAULT_OUTPUT): Promise<EventsJson> {
  const result = await aggregateEvents();
  const events = await enrichEvents(result.events);
  const summary = sourceSummary(events);
  const warnings = buildWarnings(events, summary);

  const output: EventsJson = {
    fetchedAt: result.fetchedAt.toISOString(),
    totalEvents: events.length,
    sourceSummary: summary,
    warnings,
    events: events.map(serializeEvent),
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  return output;
}

const DEFAULT_EMBEDDINGS_OUTPUT = join(process.cwd(), 'public', 'embeddings.json');

export async function buildEmbeddingsJson(
  events: EventsJson['events'],
  outputPath: string = DEFAULT_EMBEDDINGS_OUTPUT
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await generateEmbeddings(events, outputPath);
}

async function main() {
  console.log('Building public/events.json...');
  const output = await buildEventsJson();
  console.log(`Written ${output.totalEvents} events to public/events.json`);
  for (const warning of output.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  console.log('Building public/embeddings.json...');
  await buildEmbeddingsJson(output.events);
}

// Only run when this file is the entry point
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
