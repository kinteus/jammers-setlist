import { sha1Hex } from "./board-key.js";
import { getRepeatSongIds, isTrackReady } from "./track-rules.js";
// Participant-maximizing selection: of the ready songs, pick the main-set count that puts the most different
// people on stage, optionally making some people play at least once. Exact branch and bound with a time limit;
// it yields to the event loop while it works, so a big board can't stall a server or a page.
export const SELECTION_TIME_LIMIT_MS = 5000;
// setImmediate where it exists (Node), otherwise a zero-delay timer (browsers).
const yieldToEventLoop = () => new Promise((resolve) => {
    const immediate = globalThis.setImmediate;
    if (typeof immediate === "function")
        immediate(resolve);
    else
        setTimeout(resolve, 0);
});
const defaultNow = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
// Returns null when no set of `slots` songs includes everyone in `required`.
// Ties on people go to more filled seats, then to songs earlier in `songs` (board order).
export async function solveMaxParticipants({ songs, slots, required = [], timeLimitMs = SELECTION_TIME_LIMIT_MS, now = defaultNow, yieldEveryMs = 15, }) {
    const started = now();
    const personIndex = new Map();
    const indexOf = (id) => {
        let index = personIndex.get(id);
        if (index === undefined) {
            index = personIndex.size;
            personIndex.set(id, index);
        }
        return index;
    };
    // Bigger songs first: good sets turn up early and the seat bound below is a plain prefix sum.
    const order = songs
        .map((song, index) => ({ song, index, people: [...new Set(song.people)].map(indexOf) }))
        .sort((left, right) => right.people.length - left.people.length || left.index - right.index);
    const requiredIndexes = [...new Set(required)].map((id) => personIndex.get(id) ?? -1);
    if (requiredIndexes.includes(-1))
        return null;
    const n = order.length;
    const k = Math.min(slots, n);
    const people = order.map((entry) => entry.people);
    const seatPrefix = [0];
    for (const list of people)
        seatPrefix.push(seatPrefix[seatPrefix.length - 1] + list.length);
    const cover = new Int32Array(personIndex.size);
    const isRequired = new Uint8Array(personIndex.size);
    const lastPosition = new Int32Array(personIndex.size).fill(-1);
    for (const index of requiredIndexes)
        isRequired[index] = 1;
    people.forEach((list, position) => list.forEach((index) => (lastPosition[index] = position)));
    let covered = 0;
    let seats = 0;
    let requiredLeft = requiredIndexes.length;
    let best = null;
    let bestCovered = -1;
    let bestSeats = -1;
    let checked = 0;
    let stopped = false;
    let lastYield = started;
    const chosen = [];
    const gains = [];
    const take = (position) => {
        for (const index of people[position]) {
            if (cover[index]++ === 0) {
                covered++;
                if (isRequired[index])
                    requiredLeft--;
            }
        }
        seats += people[position].length;
        chosen.push(position);
    };
    const untake = (position) => {
        chosen.pop();
        seats -= people[position].length;
        for (const index of people[position]) {
            if (--cover[index] === 0) {
                covered--;
                if (isRequired[index])
                    requiredLeft++;
            }
        }
    };
    // Whether the branch at `position` with `left` songs still to pick can beat the best set so far.
    const promising = (position, left) => {
        if (n - position < left)
            return false;
        if (requiredLeft > 0) {
            for (const index of requiredIndexes)
                if (cover[index] === 0 && lastPosition[index] < position)
                    return false;
        }
        gains.length = 0;
        for (let next = position; next < n; next++) {
            let gain = 0;
            for (const index of people[next])
                if (cover[index] === 0)
                    gain++;
            gains.push(gain);
        }
        gains.sort((left, right) => right - left);
        let bound = covered;
        for (let step = 0; step < left; step++)
            bound += gains[step];
        const seatBound = seats + seatPrefix[position + left] - seatPrefix[position];
        return bound > bestCovered || (bound === bestCovered && seatBound > bestSeats);
    };
    const stack = [{ position: 0, left: k, stage: 0 }];
    while (stack.length > 0) {
        if ((checked & 1023) === 0) {
            const elapsed = now() - started;
            if (elapsed > timeLimitMs) {
                stopped = true;
                break;
            }
            if (now() - lastYield > yieldEveryMs) {
                await yieldToEventLoop();
                lastYield = now();
            }
        }
        const frame = stack[stack.length - 1];
        if (frame.stage === 0) {
            checked++;
            if (frame.left === 0) {
                if (requiredLeft === 0 && (covered > bestCovered || (covered === bestCovered && seats > bestSeats))) {
                    bestCovered = covered;
                    bestSeats = seats;
                    best = [...chosen];
                }
                stack.pop();
                continue;
            }
            if (!promising(frame.position, frame.left)) {
                stack.pop();
                continue;
            }
            take(frame.position);
            frame.stage = 1;
            stack.push({ position: frame.position + 1, left: frame.left - 1, stage: 0 });
        }
        else if (frame.stage === 1) {
            untake(frame.position);
            frame.stage = 2;
            stack.push({ position: frame.position + 1, left: frame.left, stage: 0 });
        }
        else {
            stack.pop();
        }
    }
    if (!best)
        return null;
    const picked = best.map((position) => order[position]).sort((left, right) => left.index - right.index);
    const participantIds = [...new Set(picked.flatMap((entry) => entry.song.people))];
    return {
        trackIds: picked.map((entry) => entry.song.id),
        participantIds,
        exhaustive: !stopped,
        checkedCount: checked,
        durationMs: Math.round(now() - started),
    };
}
function claimedPeople(track) {
    return [...new Set(track.seats.flatMap((seat) => (seat.status === "CLAIMED" && seat.userId ? [seat.userId] : [])))];
}
// The songs selection may pick: ready, and not played at either of the last two gigs, in board order
// (creation time, then id). `history` is newest first.
export function getSelectableSongs(tracks, minParticipantsPerTrack, history) {
    const repeats = getRepeatSongIds(history);
    return [...tracks]
        .filter((track) => isTrackReady(track.seats, minParticipantsPerTrack) && !repeats.has(track.songId))
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || (left.id < right.id ? -1 : 1))
        .map((track) => ({ id: track.id, people: claimedPeople(track) }));
}
// Fingerprint of the selectable songs and their people (16 hex characters, the start of a SHA-1): a result
// computed on another key is out of date.
export function getBoardKey(songs) {
    const text = songs.map((song) => `${song.id}:${[...song.people].sort().join(",")}`).join("|");
    return sha1Hex(text).slice(0, 16);
}
// For each person: the songs they took a seat in at gigs after their last setlist, split into ready songs
// (complete, but not picked) and incomplete ones (required seats still open). A song counts once per person.
// Pass only played gigs with a main set, the same history the selection uses.
export function buildSeatsSinceLastSetlist(gigs) {
    const lastSetlist = new Map();
    for (const gig of gigs) {
        for (const userId of gig.mainUserIds) {
            const current = lastSetlist.get(userId);
            if (!current || gig.startsAt > current)
                lastSetlist.set(userId, gig.startsAt);
        }
    }
    const stats = new Map();
    const entry = (userId) => {
        let value = stats.get(userId);
        if (!value) {
            value = { ready: 0, incomplete: 0, lastSetlistAt: lastSetlist.get(userId) ?? null };
            stats.set(userId, value);
        }
        return value;
    };
    for (const userId of lastSetlist.keys())
        entry(userId);
    for (const gig of gigs) {
        for (const track of gig.tracks) {
            const ready = isTrackReady(track.seats, gig.minParticipantsPerTrack);
            for (const userId of claimedPeople(track)) {
                const last = lastSetlist.get(userId);
                if (last && gig.startsAt <= last)
                    continue;
                if (ready)
                    entry(userId).ready++;
                else
                    entry(userId).incomplete++;
            }
        }
    }
    return stats;
}
