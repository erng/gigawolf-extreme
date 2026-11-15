// Tiny i18n. English is the default; Thai is opt-in and remembered.
// UI strings go through t(key). Strings produced by the game engine / host (log lines, prompts,
// narration, errors) stay English on the wire and are translated for display by tr().
import { storage } from './util/storage.js';

const LANG_KEY = 'gigawolf.lang';
export const LANGS = ['en', 'th'];
let lang = LANGS.includes(storage.get(LANG_KEY)) ? storage.get(LANG_KEY) : 'en';

export const getLang = () => lang;
export function setLang(l) {
  if (!LANGS.includes(l)) return;
  lang = l; storage.set(LANG_KEY, l);
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}
export const speechLang = () => (lang === 'th' ? 'th-TH' : 'en-US');

const TH = {
  // dom / roles
  'role.villager': 'ชาวบ้านตาดำๆ', 'role.werewolf': 'หมาป่า', 'role.seer': 'หมอดู', 'role.bodyguard': 'บอดี้การ์ด',
  'blurb.villager': 'หาหมาป่าให้เจอนะแก กลางคืนเธอไม่มีพลังอะไรเลย นอนไปเถอะ',
  'blurb.werewolf': 'คืนนี้กินใครดี? เลือกเหยื่อกับฝูงเลย แต่อย่าให้โดนจับได้ล่ะ ทำหน้านิ่งๆ ไว้',
  'blurb.seer': 'ทุกคืนแอบส่องได้ 1 คนว่าเป็นหมาป่าไหม ใช้พลังให้คุ้มนะ อย่าพูดเยอะเดี๋ยวโดนเก็บ',
  'blurb.bodyguard': 'ทุกคืนเลือกปกป้องได้ 1 คน กันหมาป่างับ เก่งแค่ไหนก็ต้องเดาให้ถูกนะจ๊ะ',
  'you': ' (เธอเอง)', 'dead': 'ตายแล้ว', 'connected': 'ออนไลน์', 'reconnecting': 'หลุด กำลังต่อใหม่',
  "pick": 'ตัวเลือกของ {name}',
  // home
  'home.sub': 'เกมหมาป่าในมือถือ ไม่ต้องมีพิธีกร ไม่ต้องมีใครมานั่งคุม',
  'home.resume': 'กลับเข้าเกมต่อ', 'home.name': 'ชื่อ', 'home.yourName': 'ชื่อเธอคืออะไร',
  'home.host': 'เปิดห้อง', 'home.code': 'รหัสห้อง', 'home.join': 'ขอเข้าร่วมวง',
  // lobby
  'lobby.roomCode': 'รหัสห้อง', 'lobby.share': 'ส่งลิงก์ชวนเพื่อน', 'lobby.copied': 'ก๊อปลิงก์แล้วจ้า',
  'lobby.players': 'คนในวง ({n})', 'lobby.setup': 'ตั้งค่าเกม',
  'lobby.wolves': 'หมาป่า', 'lobby.seer': 'หมอดู', 'lobby.bodyguard': 'บอดี้การ์ด', 'lobby.villagers': 'ชาวบ้าน',
  'lobby.fewer': 'ลด{label}', 'lobby.more': 'เพิ่ม{label}',
  'lobby.randomize': 'RANDOM CHAOS MODE 🎲', 'lobby.randomOn': 'RANDOM CHAOS MODE เปิดอยู่! ไม่มีใครรู้ว่าในวงมีบทบาทอะไรบ้าง แม้แต่โฮสต์ 🤫', 'lobby.manual': 'เลือกบทบาทเอง',
  'lobby.reset': 'ให้ระบบจัดบทบาทให้เอง', 'lobby.revealOnDeath': 'ตายแล้วเปิดไพ่บทบาทเลย',
  'lobby.selfProtect': 'บอดี้การ์ดปกป้องตัวเองได้ (เห็นแก่ตัวนิดนึง)', 'lobby.narration': 'เสียงเล่าเรื่อง (มือถือเครื่องนี้เป็นคนพูด)',
  'lobby.needMore': 'ขาดอีก {n} คน ไปลากเพื่อนมาเพิ่มเร็ว', 'lobby.start': 'เริ่มเกมเลย!', 'lobby.waiting': 'รอเจ้าของห้องกดเริ่มอยู่นะ ใจเย็นๆ…',
  // reveal
  'reveal.title': 'บทบาทของเธอ', 'reveal.hold': 'กดค้างไว้เพื่อแอบดูบทบาท',
  'reveal.pack': 'พวกเดียวกัน: ', 'reveal.privacy': 'เช็กรอบตัวก่อน อย่าให้ใครมาชะโงกดู',
  'reveal.waiting': 'รอคนอื่นอยู่ ช้าจัง… (พร้อมแล้ว {a}/{b})', 'reveal.ready': 'พร้อมแล้ว',
  // night
  'night.title': 'คืนที่ {n}', 'night.werewolf': 'หมาป่า', 'night.notWerewolf': 'ไม่ใช่หมาป่า จ้ะ', 'night.a': 'เป็น',
  'night.isA': '{name} คือ ', 'night.confirmed': 'โอเค ล็อกแล้ว รอเจ้าของห้องจบคืนนะ…', 'night.confirm': 'ยืนยัน',
  'night.youAre': 'เธอคือ{role}', 'night.pick': 'เป้าหมายของ {name}',
  // day / vote / dead / gameover
  'day.title': 'วันที่ {n}', 'day.sub': 'ได้เวลาเม้าท์! ใครกันที่เป็นหมาป่า? ใครตอแหลก็จับให้ได้',
  'vote.result': 'ผลโหวต', 'vote.title': 'โหวต', 'vote.skip': 'ข้ามไปก่อน (ไม่เอาใครออก)', 'vote.skipName': 'ข้าม',
  'vote.waitHost': 'รอเจ้าของห้องกดไปต่อ…', 'vote.locked': 'ล็อกโหวตแล้ว รอคนที่ยังลังเลอยู่…', 'vote.confirm': 'ยืนยันโหวต ไม่ถอยนะ',
  'dead.title': 'เธอตายแล้วจ้า', 'dead.sub': 'โหมดนั่งดูเฉยๆ รู้ความลับแล้วเก็บไว้ ห้ามแอบบอกใบ้คนที่ยังรอดนะ ไม่งั้นโกง!',
  'dead.log': 'เมื่อกี้เกิดอะไรขึ้น', 'dead.nothing': 'ยังเงียบอยู่เลย',
  'phase.night': 'กลางคืน', 'phase.day': 'กลางวัน', 'phase.vote': 'โหวต', 'phase.reveal': 'เปิดบทบาท',
  'over.wolves': 'หมาป่าชนะ! หมู่บ้านโดนจัดไป', 'over.village': 'หมู่บ้านชนะ! หมาป่าเรียบร้อย', 'over.won': 'ทีมเธอชนะ เก่งมาก ไปอวดเลย', 'over.lost': 'ทีมเธอแพ้ ไม่เป็นไร ตาหน้าเอาคืน',
  'over.happened': 'ย้อนดูว่าใครหักหลังใคร', 'over.again': 'เล่นอีกตา!', 'over.waiting': 'รอเจ้าของห้องเปิดตาใหม่…',
  // host bar
  'host.startNight': 'เริ่มกลางคืน', 'host.endNight': 'ฟ้าสางแล้ว: จบคืน', 'host.startVote': 'เริ่มโหวต',
  'host.next': 'ต่อไป', 'host.endVote': 'ปิดโหวตเลย',
  'host.ready': 'พร้อม', 'host.confirmedW': 'ยืนยัน', 'host.votedW': 'โหวตแล้ว',
  // main
  'main.connecting': 'กำลังต่อสัญญาณ…', 'main.reconnecting': 'หลุดนิดหน่อย กำลังต่อใหม่…', 'main.cancel': 'ยกเลิก',
  'main.leave': 'ออก', 'main.leaveConfirm': 'จะหนีออกจากเกมแล้วเหรอ?', 'main.unknown': 'ไม่รู้ว่าอยู่ช่วงไหนของเกมแล้ว งงเลย',
  'main.hostDown': 'เจ้าของห้องหายไป รออยู่นะ…',
  'main.wake': 'เคล็ดลับ: อย่าให้จอดับระหว่างเล่น ปิดล็อกหน้าจออัตโนมัติด้วยนะ ไม่งั้นพลาดดราม่า',
  'main.noReclaim': 'กลับเข้าห้องไม่ได้ เช็กเน็ตหน่อยแล้วลองอีกที',
  'main.noService': 'ต่อบริการจับคู่ไม่ติด เน็ตเธอโอเคไหม? เช็กแล้วลองใหม่นะ',
  'lang.button': 'English',
  // extra roles
  'role.wolfcub': 'ลูกหมาป่า', 'role.hunter': 'นายพราน', 'role.prince': 'เจ้าชาย', 'role.witch': 'แม่มด', 'role.jester': 'ตัวตลก',
  'blurb.wolfcub': 'หมาป่าตัวจิ๋วสุดน่ารัก (แต่ก็กัดนะ) ถ้าเธอตาย ฝูงจะโกรธจัด แล้วงับสองคนในคืนถัดไป!',
  'blurb.hunter': 'ถ้าเธอตาย ไม่ว่าจะแบบไหน ได้ยิงใครก็ได้ 1 คนเป็นของแถม ลากมันไปด้วยกัน!',
  'blurb.prince': 'โดนโหวตเตะครั้งแรก เธอจะเปิดตัวแล้วรอดไปได้ แต่ทุกคนจะรู้ว่าเธอคือเจ้าชาย ระวังหมาป่าไว้นะ',
  'blurb.witch': 'มียาชุบชีวิต 1 ขวด กับยาพิษ 1 ขวด ใช้ได้อย่างละครั้งเดียว คืนละขวด ใช้ให้คุ้มล่ะ',
  'blurb.jester': 'เธอไม่ได้อยู่ฝั่งไหนทั้งนั้น อยากชนะต้องทำให้ทุกคนโหวตเตะเธอออกเอง ตอแหลให้เนียนเลย!',
  'lobby.wolfcub': 'ลูกหมาป่า', 'lobby.hunter': 'นายพราน', 'lobby.witch': 'แม่มด', 'lobby.prince': 'เจ้าชาย', 'lobby.jester': 'ตัวตลก',
  'shot.title': 'ช็อตสุดท้าย', 'shot.waiting': '{name} คือนายพราน! กำลังเล็งปืนอยู่ ใครจะซวย…', 'shot.fire': 'ยิงเลย!',
  'host.skipShot': 'ข้าม (ไม่ยิงแล้ว)',
  'over.jester': 'ตัวตลกชนะ! ทุกคนโดนหลอกซะแล้ว',
  'witch.potions': 'ยาชุบชีวิต {heal} · ยาพิษ {poison}',
  'witch.waiting': 'หมาป่ายังเลือกเหยื่อไม่เสร็จ รอแป๊บนึงนะ แล้วค่อยตัดสินใจ',
  'witch.victims': 'คืนนี้หมาป่าเล็งไว้: {names}', 'witch.heal': 'ชุบชีวิต {name}', 'witch.noVictim': 'คืนนี้ไม่มีใครโดนงับ (หรือเธอไม่มียาชุบแล้ว)',
  'witch.poison': 'ใช้ยาพิษ', 'witch.confirmPoison': 'วางยาเลย', 'witch.pass': 'ไม่ใช้ยาคืนนี้',
  'night.pickTwo': 'เลือก 2 คน',
};

// Engine / host strings: [regex, replacer]. Applied globally so combined narration lines work.
const roleTh = (name) => TH[`role.${name.toLowerCase().replace(/ /g, '')}`] ?? name;
const note = (s) => s.replace(/ They were a ([\w ]+)\./g, (_, r) => ` (เขาคือ${roleTh(r)} นะจ๊ะ)`);
const TR = [
  [/Night falls\. Everyone, check your phone\./g, () => 'ค่ำคืนมาเยือนแล้ว ทุกคนหยิบมือถือขึ้นมา แล้วทำตัวดีๆ'],
  [/(.+?) was killed in the night\.( They were a [\w ]+\.)?/g, (_, n, r) => `${n} โดนเก็บไปในคืนนี้ RIP${r ? note(r) : ''}`],
  [/Nobody died\./g, () => 'ไม่มีใครตาย คืนนี้หมาป่าคงอิ่มมาแล้ว'],
  [/Day breaks\./g, () => 'ฟ้าสางแล้ว ใครยังหายใจอยู่ ยกมือหน่อย'],
  [/Time to vote\./g, () => 'ได้เวลาโหวต ชี้ตัวกันเลย อย่ากั๊ก'],
  [/(.+?) was eliminated by vote\.( They were a [\w ]+\.)?/g, (_, n, r) => `${n} โดนโหวตเตะออกจากวง${r ? note(r) : ''}`],
  [/Nobody was eliminated\./g, () => 'ไม่มีใครโดนเตะ ทุกคนรอดไปอย่างหวุดหวิด'],
  [/The village wins!/g, () => 'หมู่บ้านชนะ! หมาป่าเรียบร้อย'],
  [/The Jester wins!/g, () => 'ตัวตลกชนะ! ทุกคนโดนหลอกซะแล้ว'],
  [/(.+?) is the Prince! The village cannot eliminate them\./g, (_, n) => `${n} คือเจ้าชาย! โหวตเตะไม่ได้นะจ๊ะ รอดไปก่อน`],
  [/(.+?) shot (.+?)\.( They were a [\w ]+\.)?/g, (_, a, b, r) => `${a} ยิง ${b} ไปด้วยกัน ปัง!${r ? note(r) : ''}`],
  [/(.+?) lowered the gun\./g, (_, n) => `${n} เก็บปืนแล้ว ใจดีจัง`],
  [/(.+?) was the Jester!/g, (_, n) => `${n} คือตัวตลก!`],
  [/(.+?) was the Hunter! One last shot…/g, (_, n) => `${n} คือนายพราน! ยิงนัดสุดท้ายก่อนไป…`],
  [/The wolves win!/g, () => 'หมาป่าชนะ! หมู่บ้านโดนจัดไป'],
  [/Who do you suspect\?/g, () => 'เธอสงสัยใครอ่ะ?'],
  [/Who do you want to kill\?/g, () => 'คืนนี้จะงับใครดี?'],
  [/Who do you want to check\?/g, () => 'อยากส่องใครล่ะ?'],
  [/Who do you want to protect\?/g, () => 'จะปกป้องใครดี?'],
  [/Revenge night! Pick two victims\./g, () => 'คืนล้างแค้น! เลือกเหยื่อ 2 คนเลย'],
  [/Use a potion\?/g, () => 'จะใช้ยาไหมจ๊ะ?'],
  [/Take your last shot!/g, () => 'ยิงนัดสุดท้ายเลย จะเอาใคร!'],
  [/Who do you want to eliminate\?/g, () => 'จะเตะใครออกไป?'],
  // setup errors
  [/Need at least (\d+) players\./g, (_, n) => `ต้องมีคนอย่างน้อย ${n} คนนะ ไปหาเพื่อนมาเพิ่ม`],
  [/At most (\d+) players\./g, (_, n) => `รับได้แค่ ${n} คนเองจ้า เต็มแล้ว`],
  [/Need at least 1 werewolf\./g, () => 'ไม่มีหมาป่าแล้วจะเล่นยังไง ใส่มาอย่างน้อย 1 ตัว'],
  [/Wolves must be fewer than non-wolves\./g, () => 'หมาป่าเยอะเกินแล้ว ใจเย็น ต้องน้อยกว่าคนอื่นนะ'],
  [/Roles total (\d+) but there are (\d+) players\./g, (_, a, b) => `บทบาทรวม ${a} แต่มีคนแค่ ${b} คน เลขไม่ตรง ลองนับใหม่นะ`],
  [/No role counts\./g, () => 'ยังไม่ได้ใส่จำนวนบทบาทเลย'],
  [/Invalid count for (\w+)\./g, (_, k) => `จำนวน ${k} ดูแปลกๆ นะ แก้หน่อย`],
  // errors
  [/Already confirmed\./g, () => 'ยืนยันไปแล้วไง ใจร้อนจัง'],
  [/Already started\./g, () => 'เริ่มไปแล้วจ้า'],
  [/Host cannot leave\./g, () => 'เจ้าของห้องหนีไม่ได้นะ'],
  [/It is not night\./g, () => 'ตอนนี้ยังไม่ใช่กลางคืนนะ'],
  [/Not in role reveal\./g, () => 'ยังไม่ถึงช่วงเปิดบทบาทจ้า'],
  [/Only the host can change settings\./g, () => 'แค่เจ้าของห้องเท่านั้นที่แก้ตั้งค่าได้ อย่ามาแอบ'],
  [/Only the host can start\./g, () => 'แค่เจ้าของห้องเท่านั้นที่กดเริ่มได้ รอก่อนนะ'],
  [/Settings are locked\./g, () => 'ล็อกตั้งค่าแล้ว แก้ไม่ได้แล้วจ้า'],
  [/Unknown player\./g, () => 'ไม่รู้จักคนนี้เลย ใครอ่ะ?'],
  [/You cannot act\./g, () => 'เธอทำอันนี้ไม่ได้นะ'],
  [/Game already started\./g, () => 'เกมเริ่มไปแล้ว มาช้าไปนิดนึง'],
  [/Enter a name\./g, () => 'ใส่ชื่อหน่อยสิ จะให้เรียกว่าอะไร?'],
  [/Room is full\./g, () => 'ห้องเต็มแล้วจ้า แน่นยิ่งกว่า BTS'],
  [/Only the host can start the vote\./g, () => 'แค่เจ้าของห้องที่เริ่มโหวตได้นะ'],
  [/Only the host can continue\./g, () => 'แค่เจ้าของห้องที่กดไปต่อได้นะ'],
  [/Only the host can restart\./g, () => 'แค่เจ้าของห้องที่เริ่มใหม่ได้นะ'],
  [/Not in discussion\./g, () => 'ยังไม่ใช่ช่วงเม้าท์จ้า'],
  [/Not voting\./g, () => 'ยังไม่ถึงเวลาโหวตนะ'],
  [/You cannot vote\./g, () => 'เธอโหวตไม่ได้นะ'],
  [/Already voted\./g, () => 'โหวตไปแล้วไง จะโหวตซ้ำหรอ?'],
  [/That potion is used up\./g, () => 'ยาหมดแล้วจ้า ใช้ไปแล้วนี่'],
  [/The wolves have not chosen yet\./g, () => 'หมาป่ายังเลือกไม่เสร็จ รอก่อนนะ'],
  [/Pick two different targets\./g, () => 'ต้องเลือก 2 คนที่ไม่ซ้ำกันนะ'],
  [/Nobody is shooting\./g, () => 'ตอนนี้ไม่มีใครต้องยิงนะ'],
  [/It is not your shot\./g, () => 'ยังไม่ใช่ตาเธอยิงนะ'],
  [/Wolves would win on the first night\./g, () => 'หมาป่าชนะตั้งแต่คืนแรกแน่ๆ ไม่สนุกแล้ว ลดหมาป่า หรือใส่บอดี้การ์ด/แม่มดมาช่วยหน่อย'],
  [/A lone wolf cannot beat a village made only of Hunters\./g, () => 'หมาป่าตัวเดียวสู้หมู่บ้านนายพรานล้วนไม่ได้หรอก ยิงต่อกันตายหมดแน่ ใส่บทอื่นมาด้วย'],
  [/The village needs at least one player who is not a Jester\./g, () => 'ต้องมีคนฝั่งหมู่บ้านที่ไม่ใช่ตัวตลกอย่างน้อย 1 คนนะ ไม่งั้นโหวตทีเดียวตัวตลกชนะเลย'],
  [/Invalid target\./g, () => 'เลือกใครอยู่เนี่ย ไม่ถูกนะ'],
  [/Nothing to continue\./g, () => 'ไม่มีอะไรให้ไปต่อแล้วจ้า'],
  [/Game is not over\./g, () => 'เกมยังไม่จบ รีบไปไหน'],
  [/Version mismatch\. Reload the page\./g, () => 'เวอร์ชันไม่ตรงกัน รีโหลดหน้าหน่อยนะ'],
  [/Bad message\./g, () => 'ข้อความแปลกๆ ส่งมา งงเลย'],
  [/Can't reach the host\. Make sure everyone is on the same Wi-Fi, or join one phone's hotspot\./g,
    () => 'ติดต่อเจ้าของห้องไม่ได้ เช็กว่าทุกคนใช้ Wi-Fi เดียวกันไหม หรือไม่ก็ต่อฮอตสปอตของใครสักคนเอา'],
];

export function t(key, vars = {}) {
  let s = (lang === 'th' && TH[key]) || EN[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Translate an engine/host-generated English string for display. No-op in English. */
export function tr(text) {
  if (lang !== 'th' || !text) return text;
  return TR.reduce((s, [re, fn]) => s.replace(re, fn), text);
}

const EN = {
  'role.villager': 'Villager', 'role.werewolf': 'Werewolf', 'role.seer': 'Seer', 'role.bodyguard': 'Bodyguard',
  'blurb.villager': 'Find the wolves. You have no night power.',
  'blurb.werewolf': 'Pick a victim each night with your pack. Do not get caught.',
  'blurb.seer': 'Each night, learn if one player is a werewolf.',
  'blurb.bodyguard': 'Each night, protect one player from the wolves.',
  'you': ' (you)', 'dead': 'dead', 'connected': 'connected', 'reconnecting': 'reconnecting',
  'pick': "{name}'s pick",
  'home.sub': 'Werewolf for your phones. No moderator needed.',
  'home.resume': 'Resume game', 'home.name': 'Name', 'home.yourName': 'Your name',
  'home.host': 'Host game', 'home.code': 'Room code', 'home.join': 'Join game',
  'lobby.roomCode': 'Room code', 'lobby.share': 'Share invite link', 'lobby.copied': 'Link copied',
  'lobby.players': 'Players ({n})', 'lobby.setup': 'Game setup',
  'lobby.wolves': 'Werewolves', 'lobby.seer': 'Seer', 'lobby.bodyguard': 'Bodyguard', 'lobby.villagers': 'Villagers',
  'lobby.fewer': 'Fewer {label}', 'lobby.more': 'More {label}',
  'lobby.randomize': 'RANDOM CHAOS MODE 🎲', 'lobby.randomOn': 'RANDOM CHAOS MODE is on! Nobody knows which roles are in play, not even the host.', 'lobby.manual': 'Pick roles manually',
  'lobby.reset': 'Reset roles to auto', 'lobby.revealOnDeath': 'Reveal role on death',
  'lobby.selfProtect': 'Bodyguard can protect self', 'lobby.narration': 'Narration (this phone speaks)',
  'lobby.needMore': 'Need {n} more player{s}', 'lobby.start': 'Start game', 'lobby.waiting': 'Waiting for the host to start…',
  'reveal.title': 'Your role', 'reveal.hold': 'Press and hold to see your role',
  'reveal.pack': 'Your pack: ', 'reveal.privacy': 'Make sure nobody is looking over your shoulder.',
  'reveal.waiting': 'Waiting for others… ({a}/{b} ready)', 'reveal.ready': 'Ready',
  'night.title': 'Night {n}', 'night.werewolf': 'a Werewolf', 'night.notWerewolf': 'Not a werewolf',
  'night.isA': '{name} is ', 'night.confirmed': 'Confirmed. Waiting for the host to end the night…', 'night.confirm': 'Confirm',
  'night.youAre': 'You are the {role}.',
  'day.title': 'Day {n}', 'day.sub': 'Discuss. Who is a werewolf?',
  'vote.result': 'Vote result', 'vote.title': 'Vote', 'vote.skip': 'Skip (no elimination)', 'vote.skipName': 'Skip',
  'vote.waitHost': 'Waiting for the host to continue…', 'vote.locked': 'Vote locked in. Waiting for everyone…', 'vote.confirm': 'Confirm vote',
  'dead.title': 'You are out', 'dead.sub': 'Spectating. Keep the secrets, no talking about the game with the living!',
  'dead.log': 'What has happened', 'dead.nothing': 'Nothing yet.',
  'phase.night': 'Night', 'phase.day': 'Day', 'phase.vote': 'Vote', 'phase.reveal': 'Role reveal',
  'over.wolves': 'The wolves win!', 'over.village': 'The village wins!', 'over.won': 'Your team won.', 'over.lost': 'Your team lost.',
  'over.happened': 'What happened', 'over.again': 'Play again', 'over.waiting': 'Waiting for the host to start another game…',
  'host.startNight': 'Start night', 'host.endNight': 'Dawn: end the night', 'host.startVote': 'Start vote',
  'host.next': 'Next', 'host.endVote': 'End vote now',
  'host.ready': 'ready', 'host.confirmedW': 'confirmed', 'host.votedW': 'voted',
  'main.connecting': 'Connecting…', 'main.reconnecting': 'Reconnecting…', 'main.cancel': 'Cancel',
  'main.leave': 'Leave', 'main.leaveConfirm': 'Leave this game?', 'main.unknown': 'Unknown phase',
  'main.hostDown': 'Host disconnected, waiting…',
  'main.wake': 'Tip: keep your screen on during the game (turn off auto-lock).',
  'main.noReclaim': "Couldn't reclaim the room. Check your connection and try again.",
  'main.noService': "Can't reach the matchmaking service. Check your internet connection and try again.",
  'lang.button': 'ไทย',
  'role.wolfcub': 'Wolf Cub', 'role.hunter': 'Hunter', 'role.prince': 'Prince', 'role.witch': 'Witch', 'role.jester': 'Jester',
  'blurb.wolfcub': 'A tiny wolf with a big bite. If you die, the pack goes berserk and kills twice the next night.',
  'blurb.hunter': 'If you die, however it happens, you take one last shot at anyone you choose.',
  'blurb.prince': 'The first vote against you fails: you are revealed and survive. Everyone then knows who you are.',
  'blurb.witch': 'One heal potion and one poison potion, once each, one per night. Use them wisely.',
  'blurb.jester': 'You win alone, by getting the village to vote you out. Act suspicious!',
  'lobby.wolfcub': 'Wolf Cub', 'lobby.hunter': 'Hunter', 'lobby.witch': 'Witch', 'lobby.prince': 'Prince', 'lobby.jester': 'Jester',
  'shot.title': 'Last shot', 'shot.waiting': '{name} was the Hunter! Aiming…', 'shot.fire': 'Fire!',
  'host.skipShot': 'Skip (no shot)',
  'over.jester': 'The Jester wins!',
  'witch.potions': 'Heal {heal} · Poison {poison}',
  'witch.waiting': 'The wolves have not chosen yet. Wait a moment before you decide.',
  'witch.victims': 'The wolves are going for: {names}', 'witch.heal': 'Save {name}', 'witch.noVictim': 'Nobody is targeted tonight (or no heal potion left).',
  'witch.poison': 'Use poison', 'witch.confirmPoison': 'Poison them', 'witch.pass': 'Use no potion tonight',
  'night.pickTwo': 'Pick two',
};
