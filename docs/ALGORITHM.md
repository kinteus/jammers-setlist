# Setlist Selection Algorithm

The package holds two selections. The **current selection** (since 1.1.0) picks the main set that puts the most different people on stage. The **history-weighted ranking** below it is the earlier algorithm, kept unchanged for existing callers.

## Current selection: most different participants

There is no rating and no history weighting. Code: `src/participant-selection.ts` and `src/track-rules.ts`. Everything works on plain data (IDs, seat statuses, dates) and uses no Node-only modules, so the same functions run on a server and in a browser.

### Songs it chooses from

`getSelectableSongs(tracks, minParticipantsPerTrack, history)` keeps the tracks that are:

- **ready** (`isTrackReady`): no `OPEN` seat that is not optional, and at least `max(1, minParticipantsPerTrack)` unique participants on `CLAIMED` seats; and
- **not repeats** (`getRepeatSongIds`): the song is not in the main set of either of the `REPEAT_GIG_COUNT` (2) newest played gigs in `history` (newest first, only gigs with a main set);

in board order (creation time, then ID). Each song becomes `{ id, people }` with its unique claimed participants. Mapping the application's own records to these plain tracks, and any extra exclusions it applies, stay with the caller. The caller also checks the per-person song limit (`findParticipantsExceedingTrackLimit`) before solving.

### Solver

`solveMaxParticipants({ songs, slots, required })` chooses `min(slots, songs)` songs, `slots` being the main-set track limit, maximizing the number of unique participants:

- exact branch and bound with an explicit stack ("take song / skip song"), bigger songs first; a branch is cut when even its best possible additions can't beat the best set so far;
- ties: more filled seats, then the earlier songs in the given order (board order);
- **must-play people** (`required`): every one of them must appear at least once; branches that can no longer include someone are cut. If no set includes everyone (or someone has no ready song), the result is `null`;
- **time limit**: `timeLimitMs`, 5 s by default (`SELECTION_TIME_LIMIT_MS`). The search yields to the event loop about every 15 ms (`setImmediate` where it exists, otherwise a zero-delay `setTimeout`), and at the limit returns the best set found with `exhaustive: false`.

The result lists the chosen track IDs in the given order, their unique participant IDs, whether the search was exhaustive, how many branches were checked and how long it took (ms).

### Board key

`getBoardKey(songs)` is a fingerprint of the selectable songs and their people: the first 16 hex characters of the SHA-1 of `id:person,person|id:…` (people sorted). A result computed on another key is out of date. SHA-1 is implemented in plain JavaScript, so it gives the same value on a server and in a browser; it is a change detector, not a security measure.

### Seats since last setlist

`buildSeatsSinceLastSetlist(gigs)` takes played gigs with a main set (start time, minimum participants, the people in the main set, the board's tracks) and counts, per person, the songs they had a seat in at gigs after their last main-set appearance (every gig if never in one), each song once: **ready** songs (complete, so they missed the main set) and **incomplete** songs (a required seat open, judged with that gig's minimum). It returns a `Map` of person ID to `{ ready, incomplete, lastSetlistAt }`.

## History-weighted ranking

### Goal

Build a deterministic main set that favors musicians who have not appeared in a published main set recently. The algorithm derives participant weights from event history and then ranks tracks sequentially, recalculating scores after every selected position.

### Historical participation

A historical event is included only when it:

- starts before the current event;
- has status `PUBLISHED`; and
- contains at least one `MAIN` setlist item.

Events are ordered from newest to oldest by start time, then by ID. A musician participated in an event when they occupied at least one claimed seat on one of its published `MAIN` tracks. Multiple tracks or seats in the same event still count as one participation.

Published events without a `MAIN` set are ignored completely. The newest qualifying event is also the previous concert used for song-repeat exclusion.

### Initial participant weights

For each musician on a current active track:

- `H` is the number of qualifying historical events;
- `r` is the one-based position of their most recent appearance in that history, or `H + 1` if they never appeared; and
- `m` is the number of events they missed among the newest `min(10, H)` events.

Their initial weight is:

```text
weight = 2^r + m
```

With no qualifying history, every current participant starts with weight `2`. Weights are calculated with exact integers and stored in the selection audit JSON as decimal strings.

### Validation and eligibility

Before replacing any saved recommendation, the server checks that no participant occupies more distinct active tracks than the event's `maxTracksPerUser` limit.

Current tracks are then classified as follows:

1. A song from the previous qualifying concert becomes a repeat backlog item.
2. A non-repeat track with any unfilled required seat is excluded.
3. A non-repeat track with fewer unique claimed participants than `minParticipantsPerTrack` is excluded.
4. Every remaining track enters sequential ranking.

`TrackSeat.isOptional` affects completion only: an empty optional seat does not make a track incomplete. A musician who claims an optional seat contributes their full participant weight. This product has no legacy `opt` scoring positions.

Known groups are matched by exact claimed-member set, as before.

### Sequential ranking

For one selection run, the algorithm maintains each participant's current weight and the number of already ranked tracks they occupy.

For every remaining ordinary track:

```text
scaledScore = 10 * sum(current participant weights)
```

For an exact known-group track, a positive score is reduced to `1` (the exact-integer equivalent of the legacy `0.1` track score). A zero score remains zero.

At each position, candidates are compared by:

1. higher current scaled score;
2. lower maximum ranked-entry count among their participants;
3. more unique participants;
4. earlier track creation time; and
5. lexicographically smaller track ID.

After a track is ranked, every participant on it has their current weight set to zero and their ranked-entry count incremented. Scores are recalculated before choosing the next track. Ranking continues through the entire eligible list, including positions that will become backlog.

### Output and persistence

The first `N` ranked tracks, where `N` is the normalized event main-set track limit, become `MAIN`. Remaining ranked tracks become `BACKLOG`; previous-concert repeats are appended afterward in deterministic creation order.

Each new `SelectionRun` is saved with strategy `HISTORY_WEIGHTED`. Its audit JSON includes the history-event count, initial weights, complete ranked track IDs, main-set and backlog results, reasons, and an informational count of unique participants represented in `MAIN`.

The recommendation is replaced atomically and running selection does not close or otherwise change the board status. Admins may still curate and reorder the resulting main set and backlog manually before publication.
