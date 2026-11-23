import { describe, expect, it } from "vitest";

import { getRepeatSongIds, isTrackReady, REPEAT_GIG_COUNT } from "../src/index.js";

const claimed = (userId: string, isOptional = false) => ({ status: "CLAIMED", isOptional, userId });
const open = (isOptional = false) => ({ status: "OPEN", isOptional, userId: null });

describe("isTrackReady", () => {
  it("needs every required seat taken and the minimum number of musicians", () => {
    expect(isTrackReady([claimed("a"), open(true)], 1)).toBe(true);
    expect(isTrackReady([claimed("a"), open()], 1)).toBe(false);
    expect(isTrackReady([claimed("a"), claimed("a")], 2)).toBe(false);
    expect(isTrackReady([claimed("a"), claimed("b")], 2)).toBe(true);
  });

  it("needs at least one musician even when the minimum is zero", () => {
    expect(isTrackReady([open(true)], 0)).toBe(false);
    expect(isTrackReady([claimed("a")], 0)).toBe(true);
  });
});

describe("getRepeatSongIds", () => {
  // Newest first.
  const gigs = [
    { id: "g3", songIds: ["song-c", "song-d"] },
    { id: "g2", songIds: ["song-b"] },
    { id: "g1", songIds: ["song-a"] },
  ];

  it("covers the two latest gigs and not the one before", () => {
    expect(REPEAT_GIG_COUNT).toBe(2);
    expect([...getRepeatSongIds(gigs)].sort()).toEqual(["song-b", "song-c", "song-d"]);
    expect(getRepeatSongIds([]).size).toBe(0);
  });
});
