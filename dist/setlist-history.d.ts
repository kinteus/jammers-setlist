export type HistoricalParticipationEvent = {
    id: string;
    startsAt: Date;
    mainTrackCount: number;
    participantIds: string[];
    songIds: string[];
};
export type ParticipantHistorySnapshot = {
    eventCount: number;
    initialWeightsByParticipant: Map<string, bigint>;
    previousConcertSongIds: Set<string>;
};
export declare function buildParticipantHistorySnapshot({ currentParticipantIds, events, }: {
    currentParticipantIds: Iterable<string>;
    events: HistoricalParticipationEvent[];
}): ParticipantHistorySnapshot;
