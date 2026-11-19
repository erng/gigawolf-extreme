// Bot table talk: the lines a host-run bot can post during the day and the vote.
// A line is stored as { key, v, ids }: which kind of line, which wording (variant), and the players it names.
// Phones render it with t(`chat.<key>.<v>`, { a, b }), so every phone shows the same words in its own language.
// The text lives in js/i18n.js (English and Thai). `ids` is how many players the line names.
export const CHAT = Object.freeze({
  rip:        { ids: 1, variants: 4 }, // a night death
  accuse:     { ids: 1, variants: 4 }, // "I don't trust A"
  agree:      { ids: 1, variants: 3 }, // echoing someone else's accusation
  vouch:      { ids: 1, variants: 3 }, // "A is fine"
  defend:     { ids: 0, variants: 4 }, // when accused or most suspected
  bait:       { ids: 0, variants: 3 }, // "go on, vote me" (any role may say it; Jesters say it more)
  claimWolf:  { ids: 1, variants: 2 }, // "I'm the Seer, A is a wolf" (real Seer, or a wolf lying)
  claimClean: { ids: 1, variants: 2 }, // "I'm the Seer, A is not a wolf"
  reportWolf: { ids: 1, variants: 2 }, // a claimed Seer's later checks
  reportClean: { ids: 1, variants: 2 },
  counter:    { ids: 1, variants: 2 }, // "A is lying, I'm the real Seer"
  detective:  { ids: 2, variants: 2 }, // "A voted for B, and B was a villager"
  voteFor:    { ids: 1, variants: 3 }, // said just before voting
  voteSkip:   { ids: 0, variants: 2 },
  filler:     { ids: 0, variants: 5 },
  gotOne:     { ids: 1, variants: 2 }, // a revealed wolf died
  oops:       { ids: 1, variants: 2 }, // a revealed villager was voted out
});
export const CHAT_KEYS = Object.keys(CHAT);
export const CHAT_MAX = 60;          // lines kept in state (and sent in views); older ones drop off
export const CHAT_PER_ROUND = 4;     // most lines one bot may post in one round
// The lines a human can post from the Say sheet (js/ui/quickchat.js), in menu order. Only lines a person can
// stand behind on their own: no news reactions (rip, gotOne, oops), no Detective facts (a human has no
// verified record to quote). The engine checks key, wording and names but never the sender's role, so any
// role can post any of them, a lie included, just like a bot's claim. A human line has exactly the weight a
// bot's has: bots read chat by kind, never by who wrote it.
export const HUMAN_KEYS = Object.freeze([
  'accuse', 'agree', 'vouch', 'defend', 'bait', 'claimWolf', 'claimClean', 'counter', 'voteFor', 'voteSkip',
]);
export const PERSONALITIES = Object.freeze(['sheep', 'hothead', 'quiet', 'detective']);

export function validChatLine(key, v, ids) {
  const c = CHAT[key];
  return !!c && Number.isInteger(v) && v >= 0 && v < c.variants && Array.isArray(ids) && ids.length === c.ids;
}
