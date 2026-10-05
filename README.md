# Jammers setlist

A standalone TypeScript/JavaScript package for deterministic history-weighted song selection. No runtime dependencies, Prisma, database access, credentials, or network calls. Requires Node.js 22 or newer.

## Install

The app consumes a GitHub source archive pinned to a full commit SHA. Compiled JavaScript and declarations are committed in `dist`, so installation needs neither Git nor a build step nor registry authentication.

```sh
npm install --save-exact 'https://api.github.com/repos/kinteus/jammers-setlist/tarball/<FULL_COMMIT_SHA>'
```

## Use

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
