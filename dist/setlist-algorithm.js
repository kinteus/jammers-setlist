export const SetlistSection = { MAIN: "MAIN", BACKLOG: "BACKLOG" };
function normalizeCandidate(candidate) {
    return {
        ...candidate,
        uniqueParticipantIds: [...new Set(candidate.participantIds)],
    };
}
function compareStableTrackOrder(left, right) {
    const createdAtDelta = left.createdAt.getTime() - right.createdAt.getTime();
    return createdAtDelta || left.id.localeCompare(right.id);
}
function getOrdinaryScaledScore(candidate, currentWeights) {
    return (10n *
        candidate.uniqueParticipantIds.reduce((sum, participantId) => sum + (currentWeights.get(participantId) ?? 0n), 0n));
}
function getScaledScore(candidate, currentWeights) {
    const ordinaryScore = getOrdinaryScaledScore(candidate, currentWeights);
    if (!candidate.matchedKnownGroupName) {
        return ordinaryScore;
    }
    return ordinaryScore === 0n ? 0n : 1n;
}
function getMaxEntryCount(candidate, entryCounts) {
    return candidate.uniqueParticipantIds.reduce((maximum, participantId) => Math.max(maximum, entryCounts.get(participantId) ?? 0), 0);
}
function compareCandidates(left, right, currentWeights, entryCounts) {
    const leftScore = getScaledScore(left, currentWeights);
    const rightScore = getScaledScore(right, currentWeights);
    if (leftScore !== rightScore) {
        return leftScore > rightScore ? -1 : 1;
    }
    const entryDelta = getMaxEntryCount(left, entryCounts) - getMaxEntryCount(right, entryCounts);
    if (entryDelta !== 0) {
        return entryDelta;
    }
    if (left.uniqueParticipantIds.length !== right.uniqueParticipantIds.length) {
        return right.uniqueParticipantIds.length - left.uniqueParticipantIds.length;
    }
    return compareStableTrackOrder(left, right);
}
function rankCandidates(candidates, initialParticipantWeights) {
    const remaining = [...candidates];
    const ranked = [];
    const currentWeights = new Map(initialParticipantWeights);
    const entryCounts = new Map();
    while (remaining.length > 0) {
        let nextIndex = 0;
        for (let index = 1; index < remaining.length; index += 1) {
            if (compareCandidates(remaining[index], remaining[nextIndex], currentWeights, entryCounts) < 0) {
                nextIndex = index;
            }
        }
        const [next] = remaining.splice(nextIndex, 1);
        if (!next) {
            break;
        }
        const scaledScore = getScaledScore(next, currentWeights);
        const contributingParticipantCount = next.uniqueParticipantIds.filter((participantId) => (currentWeights.get(participantId) ?? 0n) > 0n).length;
        ranked.push({
            track: next,
            scaledScore,
            contributingParticipantCount,
        });
        for (const participantId of next.uniqueParticipantIds) {
            currentWeights.set(participantId, 0n);
            entryCounts.set(participantId, (entryCounts.get(participantId) ?? 0) + 1);
        }
    }
    return ranked;
}
function getRankingReasons(candidate) {
    const reasons = [
        `History-weighted scaled score at ranking: ${candidate.scaledScore.toString()}.`,
        `${candidate.contributingParticipantCount} participant(s) contributed non-zero weight before selection.`,
    ];
    if (candidate.track.matchedKnownGroupName) {
        reasons.push(`Known group score reduction applied for ${candidate.track.matchedKnownGroupName}.`);
    }
    return reasons;
}
export function findParticipantsExceedingTrackLimit(candidates, maxTracksPerUser) {
    const normalizedLimit = Math.max(0, Math.round(maxTracksPerUser));
    const trackCountByParticipant = new Map();
    for (const candidate of candidates) {
        for (const participantId of new Set(candidate.participantIds)) {
            trackCountByParticipant.set(participantId, (trackCountByParticipant.get(participantId) ?? 0) + 1);
        }
    }
    return [...trackCountByParticipant.entries()]
        .filter(([, count]) => count > normalizedLimit)
        .map(([participantId]) => participantId)
        .sort((left, right) => left.localeCompare(right));
}
export function buildSetlistRecommendation({ maxSetTrackCount, minParticipantsPerTrack = 1, historyEventCount, initialParticipantWeights, previousConcertSongIds, candidates, }) {
    const requiredParticipantCount = Math.max(1, Math.round(minParticipantsPerTrack));
    const normalizedCandidates = candidates.map(normalizeCandidate);
    const repeatedCandidates = normalizedCandidates
        .filter((candidate) => previousConcertSongIds.has(candidate.songId))
        .sort(compareStableTrackOrder);
    const eligibleCandidates = normalizedCandidates.filter((candidate) => !previousConcertSongIds.has(candidate.songId) &&
        !candidate.hasUnfilledRequiredSeats &&
        candidate.uniqueParticipantIds.length >= requiredParticipantCount);
    const rankedCandidates = rankCandidates(eligibleCandidates, initialParticipantWeights);
    const slotLimit = Math.max(0, Math.round(maxSetTrackCount));
    const mainCandidates = rankedCandidates.slice(0, slotLimit);
    const backlogCandidates = rankedCandidates.slice(slotLimit);
    const selected = mainCandidates.map((candidate, index) => ({
        trackId: candidate.track.id,
        orderIndex: index + 1,
        section: SetlistSection.MAIN,
        reasons: getRankingReasons(candidate),
    }));
    const rankedBacklog = backlogCandidates.map((candidate) => ({
        trackId: candidate.track.id,
        section: SetlistSection.BACKLOG,
        reasons: getRankingReasons(candidate),
    }));
    const repeatedBacklog = repeatedCandidates.map((candidate) => ({
        trackId: candidate.id,
        section: SetlistSection.BACKLOG,
        reasons: ["Skipped because the same song appeared in the previous concert."],
    }));
    const coveredParticipantIds = new Set(mainCandidates.flatMap((candidate) => candidate.track.uniqueParticipantIds));
    const serializedInitialWeights = Object.fromEntries([...initialParticipantWeights.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([participantId, weight]) => [participantId, weight.toString()]));
    return {
        selected,
        backlog: [...rankedBacklog, ...repeatedBacklog],
        coverageCount: coveredParticipantIds.size,
        historyEventCount,
        initialParticipantWeights: serializedInitialWeights,
        rankedTrackIds: rankedCandidates.map((candidate) => candidate.track.id),
    };
}
