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
  'role.villager': 'ชาวบ้าน', 'role.werewolf': 'มนุษย์หมาป่า', 'role.seer': 'ผู้หยั่งรู้', 'role.bodyguard': 'บอดี้การ์ด',
  'blurb.villager': 'หาตัวหมาป่าให้เจอ คุณไม่มีพลังในตอนกลางคืน',
  'blurb.werewolf': 'เลือกเหยื่อทุกคืนร่วมกับฝูง อย่าให้ถูกจับได้',
  'blurb.seer': 'ทุกคืน ตรวจดูว่าผู้เล่นหนึ่งคนเป็นหมาป่าหรือไม่',
  'blurb.bodyguard': 'ทุกคืน ปกป้องผู้เล่นหนึ่งคนจากหมาป่า',
  'you': ' (คุณ)', 'dead': 'ตาย', 'connected': 'เชื่อมต่อแล้ว', 'reconnecting': 'กำลังเชื่อมต่อใหม่',
  "pick": '{name} เลือก',
  // home
  'home.sub': 'เกมมนุษย์หมาป่าบนโทรศัพท์ ไม่ต้องมีผู้ดำเนินเกม',
  'home.resume': 'กลับเข้าเกม', 'home.name': 'ชื่อ', 'home.yourName': 'ชื่อของคุณ',
  'home.host': 'สร้างเกม', 'home.code': 'รหัสห้อง', 'home.join': 'เข้าร่วมเกม',
  // lobby
  'lobby.roomCode': 'รหัสห้อง', 'lobby.share': 'แชร์ลิงก์เชิญ', 'lobby.copied': 'คัดลอกลิงก์แล้ว',
  'lobby.players': 'ผู้เล่น ({n})', 'lobby.setup': 'ตั้งค่าเกม',
  'lobby.wolves': 'มนุษย์หมาป่า', 'lobby.seer': 'ผู้หยั่งรู้', 'lobby.bodyguard': 'บอดี้การ์ด', 'lobby.villagers': 'ชาวบ้าน',
  'lobby.fewer': 'ลด {label}', 'lobby.more': 'เพิ่ม {label}',
  'lobby.reset': 'รีเซ็ตบทบาทอัตโนมัติ', 'lobby.revealOnDeath': 'เปิดเผยบทบาทเมื่อตาย',
  'lobby.selfProtect': 'บอดี้การ์ดปกป้องตัวเองได้', 'lobby.narration': 'เสียงบรรยาย (โทรศัพท์เครื่องนี้พูด)',
  'lobby.needMore': 'ต้องการผู้เล่นอีก {n} คน', 'lobby.start': 'เริ่มเกม', 'lobby.waiting': 'รอโฮสต์เริ่มเกม…',
  // reveal
  'reveal.title': 'บทบาทของคุณ', 'reveal.hold': 'กดค้างเพื่อดูบทบาทของคุณ',
  'reveal.pack': 'ฝูงของคุณ: ', 'reveal.privacy': 'ระวังอย่าให้ใครแอบดู',
  'reveal.waiting': 'รอคนอื่น… (พร้อมแล้ว {a}/{b})', 'reveal.ready': 'พร้อม',
  // night
  'night.title': 'คืนที่ {n}', 'night.werewolf': 'มนุษย์หมาป่า', 'night.notWerewolf': 'ไม่ใช่มนุษย์หมาป่า', 'night.a': 'เป็น',
  'night.isA': '{name} คือ ', 'night.confirmed': 'ยืนยันแล้ว รอโฮสต์จบคืน…', 'night.confirm': 'ยืนยัน',
  'night.youAre': 'คุณคือ{role}', 'night.pick': 'เป้าหมายของ {name}',
  // day / vote / dead / gameover
  'day.title': 'วันที่ {n}', 'day.sub': 'พูดคุยกัน ใครคือมนุษย์หมาป่า?',
  'vote.result': 'ผลการโหวต', 'vote.title': 'โหวต', 'vote.skip': 'ข้าม (ไม่มีใครถูกกำจัด)', 'vote.skipName': 'ข้าม',
  'vote.waitHost': 'รอโฮสต์ดำเนินต่อ…', 'vote.locked': 'ล็อกโหวตแล้ว รอทุกคน…', 'vote.confirm': 'ยืนยันโหวต',
  'dead.title': 'คุณตกรอบแล้ว', 'dead.sub': 'โหมดผู้ชม เก็บความลับไว้ ห้ามพูดเรื่องเกมกับคนที่ยังอยู่!',
  'dead.log': 'เกิดอะไรขึ้นบ้าง', 'dead.nothing': 'ยังไม่มีอะไร',
  'phase.night': 'กลางคืน', 'phase.day': 'กลางวัน', 'phase.vote': 'โหวต', 'phase.reveal': 'เปิดบทบาท',
  'over.wolves': 'หมาป่าชนะ!', 'over.village': 'หมู่บ้านชนะ!', 'over.won': 'ทีมของคุณชนะ', 'over.lost': 'ทีมของคุณแพ้',
  'over.happened': 'เกิดอะไรขึ้นบ้าง', 'over.again': 'เล่นอีกครั้ง', 'over.waiting': 'รอโฮสต์เริ่มเกมใหม่…',
  // host bar
  'host.startNight': 'เริ่มกลางคืน', 'host.endNight': 'รุ่งสาง: จบคืน', 'host.startVote': 'เริ่มโหวต',
  'host.next': 'ถัดไป', 'host.endVote': 'จบการโหวตตอนนี้',
  'host.ready': 'พร้อม', 'host.confirmedW': 'ยืนยัน', 'host.votedW': 'โหวตแล้ว',
  // main
  'main.connecting': 'กำลังเชื่อมต่อ…', 'main.reconnecting': 'กำลังเชื่อมต่อใหม่…', 'main.cancel': 'ยกเลิก',
  'main.leave': 'ออก', 'main.leaveConfirm': 'ออกจากเกมนี้?', 'main.unknown': 'ระยะเกมไม่ทราบ',
  'main.hostDown': 'โฮสต์ขาดการเชื่อมต่อ กำลังรอ…',
  'main.wake': 'เคล็ดลับ: เปิดหน้าจอไว้ตลอดเกม (ปิดการล็อกหน้าจออัตโนมัติ)',
  'main.noReclaim': 'ไม่สามารถกลับเข้าห้องได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  'main.noService': 'เชื่อมต่อบริการจับคู่ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  'lang.button': 'English',
};

// Engine / host strings: [regex, replacer]. Applied globally so combined narration lines work.
const roleTh = (name) => TH[`role.${name.toLowerCase()}`] ?? name;
const note = (s) => s.replace(/ They were a (\w+)\./g, (_, r) => ` เขาเป็น${roleTh(r)}`);
const TR = [
  [/Night falls\. Everyone, check your phone\./g, () => 'ค่ำคืนมาเยือน ทุกคนดูโทรศัพท์ของคุณ'],
  [/(.+?) was killed in the night\.( They were a \w+\.)?/g, (_, n, r) => `${n} ถูกฆ่าในคืนนี้${r ? note(r) : ''}`],
  [/Nobody died\./g, () => 'ไม่มีใครตาย'],
  [/Day breaks\./g, () => 'ฟ้าสาง'],
  [/Time to vote\./g, () => 'ได้เวลาโหวต'],
  [/(.+?) was eliminated by vote\.( They were a \w+\.)?/g, (_, n, r) => `${n} ถูกโหวตกำจัด${r ? note(r) : ''}`],
  [/Nobody was eliminated\./g, () => 'ไม่มีใครถูกกำจัด'],
  [/The village wins!/g, () => 'หมู่บ้านชนะ!'],
  [/The wolves win!/g, () => 'หมาป่าชนะ!'],
  [/Who do you suspect\?/g, () => 'คุณสงสัยใคร?'],
  [/Who do you want to kill\?/g, () => 'คุณอยากฆ่าใคร?'],
  [/Who do you want to check\?/g, () => 'คุณอยากตรวจใคร?'],
  [/Who do you want to protect\?/g, () => 'คุณอยากปกป้องใคร?'],
  [/Who do you want to eliminate\?/g, () => 'คุณอยากกำจัดใคร?'],
  // setup errors
  [/Need at least (\d+) players\./g, (_, n) => `ต้องมีผู้เล่นอย่างน้อย ${n} คน`],
  [/At most (\d+) players\./g, (_, n) => `ผู้เล่นได้สูงสุด ${n} คน`],
  [/Need at least 1 werewolf\./g, () => 'ต้องมีมนุษย์หมาป่าอย่างน้อย 1 คน'],
  [/Wolves must be fewer than non-wolves\./g, () => 'หมาป่าต้องน้อยกว่าคนที่ไม่ใช่หมาป่า'],
  [/Roles total (\d+) but there are (\d+) players\./g, (_, a, b) => `บทบาทรวม ${a} แต่มีผู้เล่น ${b} คน`],
  [/No role counts\./g, () => 'ไม่มีจำนวนบทบาท'],
  [/Invalid count for (\w+)\./g, (_, k) => `จำนวน ${k} ไม่ถูกต้อง`],
  // errors
  [/Already confirmed\./g, () => 'ยืนยันไปแล้ว'],
  [/Already started\./g, () => 'เริ่มไปแล้ว'],
  [/Host cannot leave\./g, () => 'โฮสต์ออกไม่ได้'],
  [/It is not night\./g, () => 'ตอนนี้ไม่ใช่กลางคืน'],
  [/Not in role reveal\./g, () => 'ไม่ได้อยู่ในช่วงเปิดบทบาท'],
  [/Only the host can change settings\./g, () => 'เฉพาะโฮสต์เท่านั้นที่เปลี่ยนการตั้งค่าได้'],
  [/Only the host can start\./g, () => 'เฉพาะโฮสต์เท่านั้นที่เริ่มเกมได้'],
  [/Settings are locked\./g, () => 'ล็อกการตั้งค่าแล้ว'],
  [/Unknown player\./g, () => 'ไม่รู้จักผู้เล่น'],
  [/You cannot act\./g, () => 'คุณทำสิ่งนี้ไม่ได้'],
  [/Game already started\./g, () => 'เกมเริ่มไปแล้ว'],
  [/Enter a name\./g, () => 'กรุณาใส่ชื่อ'],
  [/Room is full\./g, () => 'ห้องเต็มแล้ว'],
  [/Only the host can start the vote\./g, () => 'เฉพาะโฮสต์เท่านั้นที่เริ่มโหวตได้'],
  [/Only the host can continue\./g, () => 'เฉพาะโฮสต์เท่านั้นที่ไปต่อได้'],
  [/Only the host can restart\./g, () => 'เฉพาะโฮสต์เท่านั้นที่เริ่มใหม่ได้'],
  [/Not in discussion\./g, () => 'ไม่ได้อยู่ในช่วงพูดคุย'],
  [/Not voting\./g, () => 'ไม่ได้อยู่ในช่วงโหวต'],
  [/You cannot vote\./g, () => 'คุณโหวตไม่ได้'],
  [/Already voted\./g, () => 'โหวตไปแล้ว'],
  [/Invalid target\./g, () => 'เป้าหมายไม่ถูกต้อง'],
  [/Nothing to continue\./g, () => 'ไม่มีอะไรให้ไปต่อ'],
  [/Game is not over\./g, () => 'เกมยังไม่จบ'],
  [/Version mismatch\. Reload the page\./g, () => 'เวอร์ชันไม่ตรงกัน โปรดรีโหลดหน้า'],
  [/Bad message\./g, () => 'ข้อความไม่ถูกต้อง'],
  [/Can't reach the host\. Make sure everyone is on the same Wi-Fi, or join one phone's hotspot\./g,
    () => 'เชื่อมต่อโฮสต์ไม่ได้ ตรวจสอบว่าทุกคนใช้ Wi-Fi เดียวกัน หรือเชื่อมต่อฮอตสปอตของโทรศัพท์เครื่องใดเครื่องหนึ่ง'],
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
};
