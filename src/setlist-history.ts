export type HistoricalParticipationEvent = {
  id: string;
  startsAt: Date;
  mainTrackCount: number;
  participantIds: string[];
  songIds: string[];
};

export type ParticipantHistorySnapshot = {
  eventCount: number;
  initialWeightsByParticipant: Map<string, bigint>;
  previousConcertSongIds: Set<string>;
};

type NormalizedHistoricalEvent = HistoricalParticipationEvent & {
  participantSet: Set<string>;
  songSet: Set<string>;
};

export function buildParticipantHistorySnapshot({
  currentParticipantIds,
  events,
}: {
  currentParticipantIds: Iterable<string>;
  events: HistoricalParticipationEvent[];
}): ParticipantHistorySnapshot {
  const orderedEvents: NormalizedHistoricalEvent[] = events
    .filter((event) => event.mainTrackCount > 0)
    .map((event) => ({
      ...event,
      participantSet: new Set(event.participantIds),
      songSet: new Set(event.songIds),
    }))
    .sort((left, right) => {
      const startsAtDelta = right.startsAt.getTime() - left.startsAt.getTime();
      return startsAtDelta || left.id.localeCompare(right.id);
    });
  const initialWeightsByParticipant = new Map<string, bigint>();
  const recentEvents = orderedEvents.slice(0, 10);

  for (const participantId of new Set(currentParticipantIds)) {
    const lastAppearanceIndex = orderedEvents.findIndex((event) =>
      event.participantSet.has(participantId),
    );
    const recencyPosition =
      lastAppearanceIndex >= 0 ? lastAppearanceIndex + 1 : orderedEvents.length + 1;
    const recentMissCount = recentEvents.filter(
      (event) => !event.participantSet.has(participantId),
    ).length;

    initialWeightsByParticipant.set(
      participantId,
      (1n << BigInt(recencyPosition)) + BigInt(recentMissCount),
    );
  }

  return {
    eventCount: orderedEvents.length,
    initialWeightsByParticipant,
    previousConcertSongIds: new Set(orderedEvents[0]?.songSet ?? []),
  };
}
