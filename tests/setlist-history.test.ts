import { describe, expect, it } from "vitest";

import {
  buildParticipantHistorySnapshot,
  type HistoricalParticipationEvent,
} from "../src/index.js";

function event(
  id: string,
  startsAt: string,
  participantIds: string[],
  songIds: string[],
): HistoricalParticipationEvent {
  return {
    id,
    startsAt: new Date(`${startsAt}T19:00:00.000Z`),
    mainTrackCount: songIds.length,
    participantIds,
    songIds,
  };
}

describe("buildParticipantHistorySnapshot", () => {
  it("calculates spreadsheet-equivalent recency weights and ignores empty main sets", () => {
    const snapshot = buildParticipantHistorySnapshot({
      currentParticipantIds: ["recent", "older", "new"],
      events: [
        event("gig-3", "2026-03-01", ["recent"], ["song-3"]),
        event("gig-2", "2026-02-01", [], ["song-2"]),
        event("gig-1", "2026-01-01", ["older", "older"], ["song-1"]),
        {
          ...event("empty", "2026-04-01", ["new"], []),
          mainTrackCount: 0,
        },
      ],
    });

    expect(snapshot.eventCount).toBe(3);
    expect(snapshot.initialWeightsByParticipant.get("recent")).toBe(4n);
    expect(snapshot.initialWeightsByParticipant.get("older")).toBe(10n);
    expect(snapshot.initialWeightsByParticipant.get("new")).toBe(19n);
    expect([...snapshot.previousConcertSongIds]).toEqual(["song-3"]);
  });

  it("counts misses only across the ten newest qualifying concerts", () => {
    const events = Array.from({ length: 12 }, (_, index) =>
      event(
        `gig-${String(index + 1).padStart(2, "0")}`,
        `2026-${String(12 - index).padStart(2, "0")}-01`,
        index === 11 ? ["oldest"] : [],
        [`song-${index + 1}`],
      ),
    );

    const snapshot = buildParticipantHistorySnapshot({
      currentParticipantIds: ["oldest", "new"],
      events,
    });

    expect(snapshot.initialWeightsByParticipant.get("oldest")).toBe(4106n);
    expect(snapshot.initialWeightsByParticipant.get("new")).toBe(8202n);
  });

  it("deduplicates inputs and uses event id to break equal timestamp ties", () => {
    const sharedStartsAt = new Date("2026-02-01T19:00:00.000Z");
    const snapshot = buildParticipantHistorySnapshot({
      currentParticipantIds: ["participant", "participant"],
      events: [
        {
          id: "gig-b",
          startsAt: sharedStartsAt,
          mainTrackCount: 1,
          participantIds: ["participant", "participant"],
          songIds: ["song-b", "song-b"],
        },
        {
          id: "gig-a",
          startsAt: sharedStartsAt,
          mainTrackCount: 1,
          participantIds: [],
          songIds: ["song-a", "song-a"],
        },
      ],
    });

    expect(snapshot.initialWeightsByParticipant.size).toBe(1);
    expect(snapshot.initialWeightsByParticipant.get("participant")).toBe(5n);
    expect([...snapshot.previousConcertSongIds]).toEqual(["song-a"]);
  });
});
