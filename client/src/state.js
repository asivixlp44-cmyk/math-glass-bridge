// Local mirror of this player's progress. The server owns the real values:
// public stats arrive through the room state, private ones in "profile" messages.
export const S = {
    cash: 0, totalCash: 0, wins: 0, answers: 0, bestStreak: 0, grade: 0, cleared: [0, 0, 0, 0], hatched: 0,
    passes: {}, quest: 0, trails: {}, trail: 'None', pets: [], equipped: [], codes: {}, gears: { calc: true },
    pathTokens: 0, reviveTokens: 0, spins: 0, wheelAt: 0, playtime: 0, chestAt: {},
    boostUntil: 0, claimedPack: false, seenTutorial: true,
    freeClaimed: {}, joinedAt: Date.now(), name: '', daily: null, friends: 0,
    // the current run (client side)
    run: null, // { b, row, streak, fallen, free }
};

// Game actions that world objects (pads, shops, chests) trigger; filled in by main.js
export const actions = {};

export const net = {
    room: null,
    offset: 0,
    send(type, msg) { if (this.room) this.room.send(type, msg || {}); },
    // Server clock in ms
    now() { return Date.now() + this.offset; },
};
