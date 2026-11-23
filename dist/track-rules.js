// Rules shared by the current selection and the screens around it: when a song is ready, and which songs are
// repeats of the last gigs. Plain data only, safe in browsers and on servers.
// How many of the latest played gigs a song may not be repeated from.
export const REPEAT_GIG_COUNT = 2;
function countClaimedPeople(seats) {
    return new Set(seats.filter((seat) => seat.status === "CLAIMED" && seat.userId).map((seat) => seat.userId)).size;
}
// Ready = every required seat is taken and the gig's minimum number of musicians (at least 1) is met. An open
// optional seat doesn't block; one person in two seats counts once.
export function isTrackReady(seats, minParticipantsPerTrack) {
    const requiredOpen = seats.filter((seat) => seat.status === "OPEN" && !seat.isOptional).length;
    return requiredOpen === 0 && countClaimedPeople(seats) >= Math.max(1, minParticipantsPerTrack);
}
// Songs from the main sets of the last REPEAT_GIG_COUNT gigs. `history` is newest first and holds only played
// gigs with a main set.
export function getRepeatSongIds(history) {
    return new Set(history.slice(0, REPEAT_GIG_COUNT).flatMap((gig) => gig.songIds));
}
