import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { sha1Hex } from "../src/board-key.js";
import { buildSeatsSinceLastSetlist, getBoardKey, getSelectableSongs, solveMaxParticipants } from "../src/index.js";

const song = (id: string, people: string[]) => ({ id, people });

// Every subset of `slots` songs, for checking the solver against brute force.
function bruteForce(songs: Array<{ id: string; people: string[] }>, slots: number, required: string[] = []) {
  let best = -1;
  const visit = (start: number, chosen: number[]) => {
    if (chosen.length === Math.min(slots, songs.length)) {
      const people = new Set(chosen.flatMap((index) => songs[index].people));
      if (required.every((id) => people.has(id))) best = Math.max(best, people.size);
      return;
    }
    for (let index = start; index < songs.length; index++) visit(index + 1, [...chosen, index]);
  };
  visit(0, []);
  return best;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("solveMaxParticipants", () => {
  it("finds the set with the most different people", async () => {
    const songs = [song("a", ["1", "2", "3"]), song("b", ["1", "2", "4"]), song("c", ["5", "6"]), song("d", ["3", "4"])];
    const result = await solveMaxParticipants({ songs, slots: 2 });
    expect(result?.trackIds).toEqual(["a", "c"]);
    expect(result?.participantIds).toHaveLength(5);
    expect(result?.exhaustive).toBe(true);
  });

  it("matches brute force on random boards, with and without required people", async () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let round = 0; round < 25; round++) {
      const songs = Array.from({ length: 9 }, (_, index) =>
        song(`s${index}`, [...new Set(Array.from({ length: 2 + Math.floor(random() * 4) }, () => `p${Math.floor(random() * 16)}`))]),
      );
      const required = round % 2 ? [songs[8].people[0]] : [];
      const result = await solveMaxParticipants({ songs, slots: 4, required });
      expect(result?.participantIds.length ?? -1).toBe(bruteForce(songs, 4, required));
      if (result) for (const id of required) expect(result.participantIds).toContain(id);
    }
  });

  it("makes required people play even when it costs others", async () => {
    const songs = [song("big", ["1", "2", "3", "4"]), song("other", ["5", "6", "7"]), song("solo", ["8", "1"])];
    const result = await solveMaxParticipants({ songs, slots: 2, required: ["8"] });
    expect(result?.trackIds).toContain("solo");
    expect(result?.participantIds).toContain("8");
  });

  it("returns null when no set can make everyone required play", async () => {
    const songs = [song("a", ["1"]), song("b", ["2"]), song("c", ["3"])];
    expect(await solveMaxParticipants({ songs, slots: 2, required: ["1", "2", "3"] })).toBeNull();
    expect(await solveMaxParticipants({ songs, slots: 2, required: ["nobody"] })).toBeNull();
  });

  it("stops at the time limit and keeps the best set found", async () => {
    let clock = 0;
    const songs = Array.from({ length: 40 }, (_, index) => song(`s${index}`, [`a${index % 7}`, `b${index % 11}`, `c${index % 13}`, `d${index}`]));
    // A fake clock that reaches the limit after a few thousand steps.
    const result = await solveMaxParticipants({ songs, slots: 15, timeLimitMs: 50, now: () => (clock += 1) });
    expect(result?.exhaustive).toBe(false);
    expect(result?.trackIds).toHaveLength(15);
  });

  it("takes every song when there are fewer than the slots", async () => {
    const result = await solveMaxParticipants({ songs: [song("a", ["1"]), song("b", ["2"])], slots: 12 });
    expect(result?.trackIds).toEqual(["a", "b"]);
  });

  it("yields with a zero-delay timer where setImmediate doesn't exist", async () => {
    vi.stubGlobal("setImmediate", undefined);
    const timer = vi.spyOn(globalThis, "setTimeout");
    let clock = 0;
    const songs = Array.from({ length: 12 }, (_, index) => song(`s${index}`, [`p${index % 5}`, `q${index}`]));
    const result = await solveMaxParticipants({ songs, slots: 4, yieldEveryMs: 0, timeLimitMs: 1e9, now: () => (clock += 1) });
    expect(timer).toHaveBeenCalled();
    expect(result?.trackIds).toHaveLength(4);
    timer.mockRestore();
  });
});

const seat = (userId: string | null, isOptional = false) => ({ status: userId ? "CLAIMED" : "OPEN", userId, isOptional });
const track = (id: string, seats: ReturnType<typeof seat>[], songId = id, createdAt = new Date("2026-01-01")) => ({ id, songId, createdAt, seats });

describe("getSelectableSongs", () => {
  it("keeps ready songs that are not repeats of the last two gigs, in board order", () => {
    const tracks = [
      track("late", [seat("1"), seat("2")], "s-late", new Date("2026-02-02")),
      track("early", [seat("3"), seat("4")], "s-early", new Date("2026-02-01")),
      track("open", [seat("5"), seat(null)], "s-open"),
      track("repeat", [seat("6"), seat("7")], "s-repeat"),
      track("old-repeat", [seat("8"), seat("9")], "s-old", new Date("2026-02-03")),
    ];
    const history = [{ songIds: ["s-repeat"] }, { songIds: [] }, { songIds: ["s-old"] }];
    const songs = getSelectableSongs(tracks, 1, history);
    expect(songs.map((entry) => entry.id)).toEqual(["early", "late", "old-repeat"]);
    expect(songs[0].people).toEqual(["3", "4"]);
  });

  it("orders songs created at the same time by id and skips songs below the minimum", () => {
    const tracks = [track("t-b", [seat("1"), seat("2")]), track("t-a", [seat("3"), seat("4")]), track("t-c", [seat("5")])];
    expect(getSelectableSongs(tracks, 2, []).map((entry) => entry.id)).toEqual(["t-a", "t-b"]);
  });
});

describe("getBoardKey", () => {
  it("is a stable 16-character fingerprint of the songs and their people", () => {
    const songs = [song("t1", ["2", "1"]), song("t2", ["3"])];
    const key = getBoardKey(songs);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(getBoardKey([...songs])).toBe(key);
    expect(getBoardKey([song("t1", ["1", "2"]), song("t2", ["3"])])).toBe(key);
    expect(getBoardKey(songs.slice(1))).not.toBe(key);
    expect(getBoardKey([song("t1", ["1", "2"]), song("t2", ["4"])])).not.toBe(key);
    expect(getBoardKey([])).toBe("da39a3ee5e6b4b0d");
  });
});

describe("sha1Hex", () => {
  it("matches the standard test vectors", () => {
    expect(sha1Hex("")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(sha1Hex("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(sha1Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("84983e441c3bd26ebaae4aa1f95129e5e54670f1");
    expect(sha1Hex("a".repeat(1000))).toBe(createHash("sha1").update("a".repeat(1000)).digest("hex"));
  });

  it("hashes UTF-8 text the same way as node:crypto", () => {
    for (const text of ["t1:1,2|t2:3", "é", "Ünïcödé ✓", "😀 x", "\ud800 lone", "x".repeat(55), "y".repeat(56), "z".repeat(64)]) {
      expect(sha1Hex(text)).toBe(createHash("sha1").update(text).digest("hex"));
    }
  });
});

describe("buildSeatsSinceLastSetlist", () => {
  it("counts ready and incomplete songs only after each person's last setlist", () => {
    const stats = buildSeatsSinceLastSetlist([
      { startsAt: new Date("2026-01-01"), minParticipantsPerTrack: 1, mainUserIds: ["p-a"], tracks: [track("t1", [seat("p-a"), seat("p-b")])] },
      {
        startsAt: new Date("2026-02-01"),
        minParticipantsPerTrack: 1,
        mainUserIds: [],
        tracks: [track("t2", [seat("p-a"), seat("p-b")]), track("t3", [seat("p-b"), seat(null)])],
      },
      { startsAt: new Date("2026-03-01"), minParticipantsPerTrack: 1, mainUserIds: ["p-c"], tracks: [track("t4", [seat("p-b"), seat("p-b", true)])] },
    ]);
    expect(stats.get("p-a")).toMatchObject({ ready: 1, incomplete: 0 });
    // Never in a setlist: every gig counts; two seats in one song count once.
    expect(stats.get("p-b")).toMatchObject({ ready: 3, incomplete: 1, lastSetlistAt: null });
    expect(stats.get("p-c")).toMatchObject({ ready: 0, incomplete: 0 });
  });
});
