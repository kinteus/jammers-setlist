export type SelectionSeat = {
    status: string;
    userId: string | null;
    isOptional: boolean;
};
export declare const REPEAT_GIG_COUNT = 2;
export declare function isTrackReady(seats: ReadonlyArray<SelectionSeat>, minParticipantsPerTrack: number): boolean;
export declare function getRepeatSongIds(history: ReadonlyArray<{
    songIds: string[];
}>): Set<string>;
