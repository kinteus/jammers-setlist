# Setlist Selection Algorithm

## Goal

Build a deterministic main set that favors musicians who have not appeared in a published main set recently. The algorithm derives participant weights from event history and then ranks tracks sequentially, recalculating scores after every selected position.

## Historical participation

A historical event is included only when it:

- starts before the current event;
- has status `PUBLISHED`; and
- contains at least one `MAIN` setlist item.

Events are ordered from newest to oldest by start time, then by ID. A musician participated in an event when they occupied at least one claimed seat on one of its published `MAIN` tracks. Multiple tracks or seats in the same event still count as one participation.

Published events without a `MAIN` set are ignored completely. The newest qualifying event is also the previous concert used for song-repeat exclusion.

## Initial participant weights

For each musician on a current active track:

- `H` is the number of qualifying historical events;
- `r` is the one-based position of their most recent appearance in that history, or `H + 1` if they never appeared; and
- `m` is the number of events they missed among the newest `min(10, H)` events.

Their initial weight is:

```text
weight = 2^r + m
```

With no qualifying history, every current participant starts with weight `2`. Weights are calculated with exact integers and stored in the selection audit JSON as decimal strings.

## Validation and eligibility

Before replacing any saved recommendation, the server checks that no participant occupies more distinct active tracks than the event's `maxTracksPerUser` limit.

Current tracks are then classified as follows:

1. A song from the previous qualifying concert becomes a repeat backlog item.
2. A non-repeat track with any unfilled required seat is excluded.
3. A non-repeat track with fewer unique claimed participants than `minParticipantsPerTrack` is excluded.
4. Every remaining track enters sequential ranking.

`TrackSeat.isOptional` affects completion only: an empty optional seat does not make a track incomplete. A musician who claims an optional seat contributes their full participant weight. This product has no legacy `opt` scoring positions.

Known groups are matched by exact claimed-member set, as before.

## Sequential ranking

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

## Output and persistence

The first `N` ranked tracks, where `N` is the normalized event main-set track limit, become `MAIN`. Remaining ranked tracks become `BACKLOG`; previous-concert repeats are appended afterward in deterministic creation order.

Each new `SelectionRun` is saved with strategy `HISTORY_WEIGHTED`. Its audit JSON includes the history-event count, initial weights, complete ranked track IDs, main-set and backlog results, reasons, and an informational count of unique participants represented in `MAIN`.

The recommendation is replaced atomically and running selection does not close or otherwise change the board status. Admins may still curate and reorder the resulting main set and backlog manually before publication.
