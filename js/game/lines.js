// Spoken phase openers. Each English line is paired with its Thai translation here, so a new line
// cannot be added without one. The engine sends the English text; i18n.js builds the Thai rules from this list.
// No line may name a role.
export const NIGHT_LINES = [
  { en: 'Night falls. The village goes quiet.', th: 'ค่ำคืนมาเยือนแล้ว หมู่บ้านเงียบกริบ' },
  { en: 'The sun sets. Wolves, sharpen your claws.', th: 'ตะวันตกดินแล้ว หมาป่าลับเล็บให้พร้อม' },
  { en: 'Darkness settles over the village. Time to make your move.', th: 'ความมืดคลุมหมู่บ้าน ถึงเวลาลงมือแล้ว' },
  { en: 'Night falls. Somewhere in the dark, something is hungry.', th: 'ค่ำคืนมาเยือนแล้ว ในความมืดมีบางอย่างกำลังหิว' },
  { en: 'The moon rises. Choose carefully.', th: 'พระจันทร์ขึ้นแล้ว เลือกให้ดีล่ะ' },
  { en: 'Night has come. Do what you do best.', th: 'กลางคืนมาถึงแล้ว ใครมีฝีมืออะไร งัดออกมาเลย' },
];

export const DAY_LINES = [
  { en: 'Day breaks.', th: 'ฟ้าสางแล้ว ใครยังหายใจอยู่ ยกมือหน่อย' },
  { en: 'The sun rises.', th: 'ตะวันขึ้นแล้ว มานับหัวกันหน่อย' },
  { en: 'Morning comes.', th: 'เช้าแล้ว ลืมตาตื่นขึ้นมาดูกัน' },
  { en: 'The rooster crows.', th: 'ไก่ขันแล้ว วันใหม่เริ่มต้นขึ้น' },
  { en: 'A new day begins.', th: 'วันใหม่เริ่มแล้ว มาดูกันว่าเมื่อคืนเกิดอะไรขึ้น' },
  { en: 'Dawn arrives.', th: 'รุ่งเช้ามาถึงแล้ว' },
];

export const VOTE_LINES = [
  { en: 'Time to vote.', th: 'ได้เวลาโหวต ชี้ตัวกันเลย อย่ากั๊ก' },
  { en: 'The village must decide. Cast your votes.', th: 'หมดเวลาคุยแล้ว ได้เวลาตัดสินกันเลย' },
  { en: 'Who looks guilty? Cast your votes.', th: 'ใครดูมีพิรุธที่สุด ลงคะแนนกันเลย' },
  { en: 'Enough talk. Cast your votes.', th: 'พูดกันมาพอแล้ว ลงคะแนนได้เลย' },
  { en: 'Point a finger, and make it count.', th: 'ถึงเวลาชี้นิ้วแล้ว โหวตให้ดีนะ' },
  { en: 'The time for talking is over. Vote now.', th: 'ถึงเวลาตัดสินใจ ลงมือโหวตกันเลย' },
];

const hashStr = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// Picks a line without touching the game's rng. The round number steps through the list, so lines
// do not repeat back to back, and a hash of the dealt roles gives each game its own starting point.
export function pickLine(state, kind, lines) {
  const seed = hashStr(`${kind}:${state.players.map((p) => p.role).join(',')}`);
  return lines[(state.round + seed) % lines.length].en;
}
