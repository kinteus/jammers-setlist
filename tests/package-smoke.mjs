import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temp = mkdtempSync(join(tmpdir(), "jammers-setlist-"));
try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", temp], { encoding: "utf8" }));
  assert.ok(packed[0].files.some(({ path }) => path === "dist/index.d.ts"));
  writeFileSync(join(temp, "package.json"), '{"private":true,"type":"module"}');
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(temp, packed[0].filename)], { cwd: temp });
  execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { buildParticipantHistorySnapshot, buildSetlistRecommendation } from '@kinteus/jammers-setlist';
    const history = buildParticipantHistorySnapshot({ currentParticipantIds: ['u1'], events: [] });
    assert.equal(history.initialWeightsByParticipant.get('u1'), 2n);
    const result = buildSetlistRecommendation({ maxSetTrackCount: 1, historyEventCount: history.eventCount,
      initialParticipantWeights: history.initialWeightsByParticipant, previousConcertSongIds: history.previousConcertSongIds,
      candidates: [{ id: 't1', songId: 's1', songTitle: 'Example', artistName: 'Example', participantIds: ['u1'],
        createdAt: new Date('2026-01-01'), matchedKnownGroupName: null }] });
    assert.equal(result.selected[0].section, 'MAIN');
    assert.deepEqual(result.rankedTrackIds, ['t1']);
    assert.doesNotThrow(() => JSON.stringify(result));
  `], { cwd: temp, stdio: "inherit" });
} finally { rmSync(temp, { recursive: true, force: true }); }
