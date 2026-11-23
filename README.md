# Jammers setlist

A standalone TypeScript/JavaScript package for deterministic setlist selection: the current participant-maximizing selection and the earlier history-weighted ranking. No runtime dependencies, Prisma, database access, credentials, or network calls. The participant-maximizing selection and its rules use no Node-only modules, so they also run in browsers. Requires Node.js 22 or newer on the server.

## Install

The app consumes a GitHub source archive pinned to a full commit SHA. Compiled JavaScript and declarations are committed in `dist`, so installation needs neither Git nor a build step nor registry authentication.

```sh
npm install --save-exact 'https://api.github.com/repos/kinteus/jammers-setlist/tarball/<FULL_COMMIT_SHA>'
```

## Use

### Current selection: most different participants

```js
import {
  buildSeatsSinceLastSetlist,
  getBoardKey,
  getSelectableSongs,
  isTrackReady,
  solveMaxParticipants,
} from '@kinteus/jammers-setlist';

const seats = [
  { status: 'CLAIMED', userId: 'musician-1', isOptional: false },
  { status: 'CLAIMED', userId: 'musician-2', isOptional: false },
  { status: 'OPEN', userId: null, isOptional: true },
];
const tracks = [{ id: 'track-1', songId: 'song-1', createdAt: new Date('2026-01-01'), seats }];
// Newest played gig first; songs from the main sets of the 2 newest are skipped.
const history = [{ songIds: ['song-9'] }, { songIds: ['song-8'] }];

isTrackReady(seats, 2); // true: the only open seat is optional
const songs = getSelectableSongs(tracks, 2, history); // [{ id: 'track-1', people: ['musician-1', 'musician-2'] }]
const boardKey = getBoardKey(songs); // 16 hex characters; compare later to spot board changes
const solution = await solveMaxParticipants({ songs, slots: 12, required: ['musician-2'] });
if (!solution) throw new Error('No main set includes everyone required');
console.log(solution.trackIds, solution.participantIds, solution.exhaustive);
```

`solveMaxParticipants` returns `null` when no set includes every `required` person; otherwise `{ trackIds, participantIds, exhaustive, checkedCount, durationMs }`. It yields to the event loop while it works and stops at `timeLimitMs` (default `SELECTION_TIME_LIMIT_MS`, 5 s) with the best set found and `exhaustive: false`.

`buildSeatsSinceLastSetlist(gigs)` takes played gigs (`startsAt`, `minParticipantsPerTrack`, `mainUserIds`, `tracks` as above) and returns a `Map` of person ID to `{ ready, incomplete, lastSetlistAt }`.

The caller maps its own records to these plain tracks, checks the per-person song limit (`findParticipantsExceedingTrackLimit`), applies any extra exclusions of its own, and stores results.

Exports: `solveMaxParticipants`, `SELECTION_TIME_LIMIT_MS`, `getSelectableSongs`, `getBoardKey`, `buildSeatsSinceLastSetlist`, `isTrackReady`, `getRepeatSongIds`, `REPEAT_GIG_COUNT`, and the types `SelectionSong`, `SelectionSolution`, `SolveMaxParticipantsInput`, `SelectionBoardTrack`, `SelectionSeat`, `PlayedGig`, `SeatsSinceLastSetlist`.

### History-weighted ranking

```js
import {
  buildParticipantHistorySnapshot,
  findParticipantsExceedingTrackLimit,
  buildSetlistRecommendation,
} from '@kinteus/jammers-setlist';

const candidates = [{
  id: 'track-1', songId: 'song-1', songTitle: 'Example', artistName: 'Example',
  participantIds: ['musician-1'], createdAt: new Date('2026-01-01'),
  hasUnfilledRequiredSeats: false, matchedKnownGroupName: null,
}];
const exceeded = findParticipantsExceedingTrackLimit(candidates, 3);
if (exceeded.length) throw new Error(`Track limit exceeded: ${exceeded.join(', ')}`);
const history = buildParticipantHistorySnapshot({
  currentParticipantIds: candidates.flatMap(track => track.participantIds),
  events: [],
});
const recommendation = buildSetlistRecommendation({
  candidates, maxSetTrackCount: 24, minParticipantsPerTrack: 1,
  historyEventCount: history.eventCount,
  initialParticipantWeights: history.initialWeightsByParticipant,
  previousConcertSongIds: history.previousConcertSongIds,
});
console.log(recommendation.selected);
```

`buildParticipantHistorySnapshot` takes `HistoricalParticipationEvent[]` with `id`, `startsAt: Date`, `mainTrackCount`, `participantIds`, and `songIds`. The caller must supply only published events earlier than the current event, with participants and songs from MAIN tracks. The package drops empty main sets, sorts history, deduplicates participants, and calculates exact bigint weights.

The caller also supplies active candidates, required-seat completeness, exact known-group matches, and a normalized track-count limit. It enforces authorization and track-limit failures and persists the result atomically. These application responsibilities intentionally remain outside the package.

Exports include `CandidateTrack`, `SelectionInput`, `SelectionResult`, `HistoricalParticipationEvent`, `ParticipantHistorySnapshot`, and the string-valued `SetlistSection` constant/type. Results use `MAIN` / `BACKLOG` strings compatible with the application database; audit weights are decimal strings and can be serialized to JSON. Inputs contain Dates, Maps, Sets and bigint values and are not plain JSON.

See [algorithm rules](docs/ALGORITHM.md) for scoring and tie-break details.

## Develop and contribute

```sh
npm ci
npm run check
```

Commit rebuilt `dist` alongside source changes. CI checks tests, a packed-package consumer, and that generated output matches source. Existing algorithm regression tests are preserved; the app also tests the installed dependency.

Issues and pull requests from forks are welcome. Only @kinteus may perform the final merge to `main`. See [CONTRIBUTING.md](CONTRIBUTING.md).

Public visibility does not grant a general reuse license; this package is currently UNLICENSED. The owner can add a license separately.
