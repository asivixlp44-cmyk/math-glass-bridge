import { schema, t } from '@colyseus/schema';

// Public, synced to every client. Private progress (passes, pets bag, quests...)
// is sent only to its owner with the "profile" message.
export const PlayerState = schema({
    name: t.string().default(''),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    ry: t.angle(),
    anim: t.uint8().default(0),     // 0 idle, 1 run, 2 air, 3 falling
    cash: t.number().default(0),
    wins: t.number().default(0),
    answers: t.number().default(0), // lifetime right answers
    k: t.int8().default(-1),        // stage of the current run (-1: none)
    stage: t.uint8().default(0),    // stages cleared (checkpoint)
    rebirths: t.uint16().default(0),
    row: t.uint8().default(0),      // rows answered on it
    streak: t.uint16().default(0),
    trail: t.uint8().default(0),    // index into TRAILS
    pets: t.string().default(''),   // equipped pet ids, "|" separated
    vip: t.boolean().default(false),
    gear: t.string().default(''),   // gear in hand
    kit: t.uint8().default(0),
    skin: t.uint8().default(0),
    av: t.string().default(''),     // packed Bloxity avatar (equipped ids + proportions)
}, 'PlayerState');

export const GameState = schema({
    players: t.map(PlayerState),
}, 'GameState');
