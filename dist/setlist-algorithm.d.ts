export declare const SetlistSection: {
    readonly MAIN: "MAIN";
    readonly BACKLOG: "BACKLOG";
};
export type SetlistSection = (typeof SetlistSection)[keyof typeof SetlistSection];
export type CandidateTrack = {
    id: string;
    songId: string;
    songTitle: string;
    artistName: string;
    hasUnfilledRequiredSeats?: boolean;
    participantIds: string[];
    createdAt: Date;
    matchedKnownGroupName: string | null;
};
export type SelectionInput = {
    maxSetTrackCount: number;
    minParticipantsPerTrack?: number;
    historyEventCount: number;
    initialParticipantWeights: ReadonlyMap<string, bigint>;
    previousConcertSongIds: Set<string>;
    candidates: CandidateTrack[];
};
type RankedSetlistItem = {
    trackId: string;
    orderIndex: number;
    section: SetlistSection;
    reasons: string[];
};
type BacklogSetlistItem = {
    trackId: string;
    section: SetlistSection;
    reasons: string[];
};
export type SelectionResult = {
    selected: RankedSetlistItem[];
    backlog: BacklogSetlistItem[];
    coverageCount: number;
    historyEventCount: number;
    initialParticipantWeights: Record<string, string>;
    rankedTrackIds: string[];
};
export declare function findParticipantsExceedingTrackLimit(candidates: Pick<CandidateTrack, "participantIds">[], maxTracksPerUser: number): string[];
export declare function buildSetlistRecommendation({ maxSetTrackCount, minParticipantsPerTrack, historyEventCount, initialParticipantWeights, previousConcertSongIds, candidates, }: SelectionInput): SelectionResult;
export {};
