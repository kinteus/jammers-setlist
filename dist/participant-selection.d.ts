import { type SelectionSeat } from "./track-rules.js";
export declare const SELECTION_TIME_LIMIT_MS = 5000;
export type SelectionSong = {
    id: string;
    people: string[];
};
export type SelectionSolution = {
    trackIds: string[];
    participantIds: string[];
    exhaustive: boolean;
    checkedCount: number;
    durationMs: number;
};
export type SolveMaxParticipantsInput = {
    songs: SelectionSong[];
    slots: number;
    required?: string[];
    timeLimitMs?: number;
    now?: () => number;
    yieldEveryMs?: number;
};
export declare function solveMaxParticipants({ songs, slots, required, timeLimitMs, now, yieldEveryMs, }: SolveMaxParticipantsInput): Promise<SelectionSolution | null>;
export type SelectionBoardTrack = {
    id: string;
    songId: string;
    createdAt: Date;
    seats: ReadonlyArray<SelectionSeat>;
};
export declare function getSelectableSongs(tracks: ReadonlyArray<SelectionBoardTrack>, minParticipantsPerTrack: number, history: ReadonlyArray<{
    songIds: string[];
}>): SelectionSong[];
export declare function getBoardKey(songs: ReadonlyArray<SelectionSong>): string;
export type SeatsSinceLastSetlist = {
    ready: number;
    incomplete: number;
    lastSetlistAt: Date | null;
};
export type PlayedGig = {
    startsAt: Date;
    minParticipantsPerTrack: number;
    mainUserIds: string[];
    tracks: ReadonlyArray<SelectionBoardTrack>;
};
export declare function buildSeatsSinceLastSetlist(gigs: ReadonlyArray<PlayedGig>): Map<string, SeatsSinceLastSetlist>;
