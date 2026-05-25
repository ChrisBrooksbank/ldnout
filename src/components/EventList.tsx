import { useEffect, useState } from 'react';
import type { CmEvent } from '../types';
import EventCard from './EventCard';

interface EventListProps {
  events: CmEvent[];
  onSelect?: (event: CmEvent) => void;
  getDistanceMiles?: (event: CmEvent) => number | null;
}

const PAGE_SIZE = 50;

export default function EventList({ events, onSelect, getDistanceMiles }: EventListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleEvents = events.slice(0, visibleCount);
  const hiddenCount = Math.max(events.length - visibleEvents.length, 0);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [events]);

  if (events.length === 0) {
    return <p className="event-list__empty">No events found. Try adjusting your filters.</p>;
  }

  return (
    <>
      <ul className="event-list" aria-label="Events">
        {visibleEvents.map(event => (
          <li key={event.id} className="event-list__item">
            {onSelect ? (
              <button
                className="event-list__item-button"
                onClick={() => onSelect(event)}
                aria-label={`View details for ${event.title}`}
              >
                <EventCard event={event} distanceMiles={getDistanceMiles?.(event) ?? null} />
              </button>
            ) : (
              <EventCard event={event} distanceMiles={getDistanceMiles?.(event) ?? null} />
            )}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          className="event-list__more"
          type="button"
          onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
        >
          Show {Math.min(PAGE_SIZE, hiddenCount)} more
        </button>
      )}
    </>
  );
}
