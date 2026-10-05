import { SetlistSection } from "../src/index.js";
import { describe, expect, it } from "vitest";

import {
  buildSetlistRecommendation,
  findParticipantsExceedingTrackLimit,
} from "../src/index.js";

function candidate(
  id: string,
  participantIds: string[],
  overrides: Partial<{
    songId: string;
    hasUnfilledRequiredSeats: boolean;
    createdAt: Date;
    matchedKnownGroupName: string | null;
  }> = {},
) {
  return {
    id,
    songId: overrides.songId ?? `song-${id}`,
    songTitle: id,
    artistName: "Artist",
    hasUnfilledRequiredSeats: overrides.hasUnfilledRequiredSeats ?? false,
    participantIds,
    createdAt: overrides.createdAt ?? new Date("2026-08-01T12:00:00.000Z"),
    matchedKnownGroupName: overrides.matchedKnownGroupName ?? null,
  };
}

function input(overrides: Partial<Parameters<typeof buildSetlistRecommendation>[0]> = {}) {
  return {
    maxSetTrackCount: 2,
    minParticipantsPerTrack: 1,
    historyEventCount: 3,
    initialParticipantWeights: new Map<string, bigint>(),
    previousConcertSongIds: new Set<string>(),
    candidates: [],
    ...overrides,
  };
}

describe("buildSetlistRecommendation", () => {
  it("recalculates remaining scores after zeroing every participant on the chosen track", () => {
    const result = buildSetlistRecommendation(
      input({
        initialParticipantWeights: new Map([
          ["u1", 16n],
          ["u2", 8n],
          ["u3", 4n],
        ]),
        candidates: [
          candidate("shared-first", ["u1", "u2"]),
          candidate("u1-again", ["u1"]),
          candidate("fresh-after-zero", ["u3"]),
        ],
      }),
    );

    expect(result.rankedTrackIds).toEqual([
      "shared-first",
      "fresh-after-zero",
      "u1-again",
    ]);
    expect(result.selected.map((item) => item.trackId)).toEqual([
      "shared-first",
      "fresh-after-zero",
    ]);
    expect(result.backlog.map((item) => item.trackId)).toEqual(["u1-again"]);
    expect(result.coverageCount).toBe(3);
    expect(result.historyEventCount).toBe(3);
    expect(result.initialParticipantWeights).toEqual({ u1: "16", u2: "8", u3: "4" });
  });

  it("reduces a positive known-group score below an ordinary participant score", () => {
    const result = buildSetlistRecommendation(
      input({
        maxSetTrackCount: 2,
        initialParticipantWeights: new Map([
          ["band-user", 1_000n],
          ["ordinary-user", 2n],
        ]),
        candidates: [
          candidate("known-band", ["band-user"], {
            matchedKnownGroupName: "Known Band",
          }),
          candidate("ordinary", ["ordinary-user"]),
        ],
      }),
    );

    expect(result.rankedTrackIds).toEqual(["ordinary", "known-band"]);
    expect(result.selected[1]?.reasons.join(" ")).toContain("Known group");
  });

  it("keeps a zero-score known group at zero", () => {
    const result = buildSetlistRecommendation(
      input({
        maxSetTrackCount: 1,
        candidates: [
          candidate("known-band", ["u2"], { matchedKnownGroupName: "Known Band" }),
          candidate("ordinary", ["u1"], {
            createdAt: new Date("2026-08-01T11:00:00.000Z"),
          }),
        ],
      }),
    );

    expect(result.rankedTrackIds).toEqual(["ordinary", "known-band"]);
  });

  it("prefers participants with fewer already ranked entries when scores tie", () => {
    const result = buildSetlistRecommendation(
      input({
        maxSetTrackCount: 3,
        initialParticipantWeights: new Map([["u1", 8n]]),
        candidates: [
          candidate("lead", ["u1"], {
            createdAt: new Date("2026-08-01T10:00:00.000Z"),
          }),
          candidate("u1-repeat", ["u1"], {
            createdAt: new Date("2026-08-01T11:00:00.000Z"),
          }),
          candidate("not-yet-ranked", ["u2"], {
            createdAt: new Date("2026-08-01T12:00:00.000Z"),
          }),
        ],
      }),
    );

    expect(result.rankedTrackIds).toEqual(["lead", "not-yet-ranked", "u1-repeat"]);
  });

  it("uses participant count, creation time, and id as deterministic tie-breaks", () => {
    const result = buildSetlistRecommendation(
      input({
        maxSetTrackCount: 4,
        candidates: [
          candidate("z-last", ["u6"], {
            createdAt: new Date("2026-08-01T12:00:00.000Z"),
          }),
          candidate("a-before-z", ["u5"], {
            createdAt: new Date("2026-08-01T12:00:00.000Z"),
          }),
          candidate("earlier", ["u4"], {
            createdAt: new Date("2026-08-01T11:00:00.000Z"),
          }),
          candidate("larger", ["u1", "u2"], {
            createdAt: new Date("2026-08-01T13:00:00.000Z"),
          }),
        ],
      }),
    );

    expect(result.rankedTrackIds).toEqual(["larger", "earlier", "a-before-z", "z-last"]);
  });

  it("preserves current filters and gives previous-song backlog precedence", () => {
    const result = buildSetlistRecommendation(
      input({
        maxSetTrackCount: 1,
        minParticipantsPerTrack: 2,
        initialParticipantWeights: new Map([
          ["u1", 8n],
          ["u2", 4n],
          ["u3", 2n],
          ["u4", 2n],
        ]),
        previousConcertSongIds: new Set(["song-repeat"]),
        candidates: [
          candidate("selected", ["u1", "u2"]),
          candidate("ranked-backlog", ["u3", "u4"]),
          candidate("repeat", ["u1"], {
            songId: "song-repeat",
            hasUnfilledRequiredSeats: true,
          }),
          candidate("incomplete", ["u1", "u2"], {
            hasUnfilledRequiredSeats: true,
          }),
          candidate("below-minimum", ["u1", "u1"]),
        ],
      }),
    );

    expect(result.selected).toEqual([
      expect.objectContaining({
        trackId: "selected",
        section: SetlistSection.MAIN,
        orderIndex: 1,
      }),
    ]);
    expect(result.backlog.map((item) => item.trackId)).toEqual([
      "ranked-backlog",
      "repeat",
    ]);
    expect(result.backlog[1]?.reasons[0]).toContain("previous concert");
  });

  it("puts the complete ranked list in backlog when the main-set limit is zero", () => {
    const result = buildSetlistRecommendation(
      input({
        maxSetTrackCount: 0,
        initialParticipantWeights: new Map([
          ["u1", 4n],
          ["u2", 2n],
        ]),
        candidates: [candidate("first", ["u1"]), candidate("second", ["u2"])],
      }),
    );

    expect(result.selected).toEqual([]);
    expect(result.backlog.map((item) => item.trackId)).toEqual(["first", "second"]);
    expect(result.backlog.every((item) => item.section === SetlistSection.BACKLOG)).toBe(true);
  });
});

describe("findParticipantsExceedingTrackLimit", () => {
  it("counts a participant once per track and returns stable participant ids", () => {
    const exceeded = findParticipantsExceedingTrackLimit(
      [
        candidate("one", ["u2", "u2", "u1"]),
        candidate("two", ["u2", "u1"]),
        candidate("three", ["u2"]),
        candidate("four", ["u3"]),
      ],
      2,
    );

    expect(exceeded).toEqual(["u2"]);
  });
});
