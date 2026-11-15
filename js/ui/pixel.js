// Pixel-art role sprites: 16x16 string grids + palettes, rendered as inline SVG <rect>s.
// UI-only module (uses the DOM); never import from game/net code.
const NS = 'http://www.w3.org/2000/svg';
const SIZE = 16;

// '.' = transparent. Letters index into the role's palette.
const SPRITES = {
  villager: {
    pal: { h: '#f2c94c', H: '#c9962b', s: '#ffd3a8', k: '#2a1a12', b: '#e0716b', t: '#5b8def', T: '#3f66b8', w: '#8b5a2b', f: '#cfd6e4' },
    grid: [
      '................',
      '.....hhhhh......',
      '....hhhhhhh.....',
      '..HHHHHHHHHHH.f.',
      '....sssssss..f.f',
      '....sksssks..fff',
      '....sbsssbs...w.',
      '.....sssss....w.',
      '....ttttttt...w.',
      '...sttttttts..w.',
      '...sttTTTtts..w.',
      '....ttttttt...w.',
      '....TTTTTTT...w.',
      '....kk...kk...w.',
      '....kk...kk.....',
      '................',
    ],
  },
  werewolf: {
    pal: { g: '#7d6a9c', G: '#54456f', l: '#a99ac4', p: '#ffb3c7', y: '#ffe14d', k: '#1a1224', w: '#ffffff', n: '#2a1a35', r: '#e0556b' },
    grid: [
      '................',
      '..GG........GG..',
      '.GppG......GppG.',
      '.GppGGGGGGGGppG.',
      '.GgggggggggggG..',
      '..ggyyggggyyg...',
      '..ggykgggkyyg...',
      '..gglllnnlllg...',
      '..glllnnnnllg...',
      '...llwnrrnwl....',
      '...llwwrrwwl....',
      '....gllllllg....',
      '...ggggggggg....',
      '..gggGggggGggg..',
      '..ggg.gggg.ggg..',
      '..GG........GG..',
    ],
  },
  seer: {
    pal: { c: '#6b4fd0', C: '#4a35a0', s: '#ffd3a8', k: '#1a1030', y: '#ffe14d', b: '#7dff9a', B: '#1fa84f', W: '#ffffff', m: '#2d2250', e: '#e0716b' },
    grid: [
      '.......cc.......',
      '......cccc......',
      '.....cccccc.....',
      '....cccCCccc....',
      '....ccmmmmcc....',
      '...ccmsssssmc...',
      '...ccmyskysmc...',
      '...ccmsssssmc...',
      '...cccmsesmccc..',
      '..ccccccccccc...',
      '.cccc..BBBB.ccc.',
      '.ccc..BWbbBB.cc.',
      '.ccc..BbbbbB.cc.',
      '.cCc...BBBB.CCc.',
      '.CCCC.......CCC.',
      '................',
    ],
  },
  bodyguard: {
    pal: { s: '#ffd3a8', S: '#d98f5c', k: '#101018', h: '#f2c94c', H: '#c9962b', r: '#e0556b', u: '#3a4668', U: '#262f4a', b: '#d9a82b', B: '#7a1f2b', y: '#d9434f' },
    grid: [
      '................',
      '.....hhhhhh.....',
      '....hhhhhhhh....',
      '..hhsssssssshh..',
      '..hhsksssskshh..',
      '..hhsssssssshh..',
      '..hHsssrrsssHh..',
      '.hhh.ssssss.hhh.',
      'BBBBBBBBB.uussS.',
      'BbbbybbbB.uSsssS',
      'BbyyyyybB.uSsssS',
      '.BbbybbB..uussS.',
      '.BbbybbB..uu.ss.',
      '..BbybBUUUU.....',
      '...BbBk..kk.....',
      '....Bkk..kk.....',
    ],
  },
  wolfcub: {
    pal: { g: '#c7b8e8', G: '#8e7bb5', l: '#e6dcf5', p: '#ffb3c7', k: '#1a1224', w: '#ffffff', n: '#2a1a35', r: '#e0556b', y: '#ffe14d' },
    grid: [
      '................',
      '................',
      '..GG........GG..',
      '.GppG......GppG.',
      '.GppGGGGGGGGppG.',
      '..GggggggggggG..',
      '..ggkwggggkwgg..',
      '..ggkkggggkkgg..',
      '..gggllnnllggg..',
      '...gllllllllg...',
      '....llwllwll....',
      '....rrryyrrr....',
      '...ggrrrrrrgg...',
      '...gggggggggg...',
      '...ggg.GG.ggg...',
      '...GGG....GGG...',
    ],
  },
  hunter: {
    pal: { g: '#3f8f4f', G: '#2b6137', r: '#e0556b', s: '#ffd3a8', k: '#2a1a12', m: '#c0504d', b: '#8b5a2b', B: '#5a3a1a', w: '#c68642', f: '#e8e8e8' },
    grid: [
      '................',
      '.........rrr....',
      '.....gggggggrr..',
      '....ggggggggg...',
      '...GGGGGGGGGGG..',
      '....sssssss.....',
      '....sksssks..w..',
      '....ssmmmss..ww.',
      '.....sssss....w.',
      '...bbbbbbbbb..w.',
      '..sbbbbBbbbbsfw.',
      '..sbbbbBbbbbsfw.',
      '...bbbbBbbbb.fw.',
      '....BBBBBBB..w..',
      '....kk...kk..w..',
      '....kk...kk.....',
    ],
  },
  prince: {
    pal: { y: '#ffd23f', r: '#e0556b', h: '#8a5a2b', s: '#ffd3a8', k: '#1a1224', m: '#c0504d', W: '#ffffff', c: '#b3263e', b: '#3f66b8', B: '#2c4a8a' },
    grid: [
      '................',
      '....y..y..y.....',
      '....yyyyyyy.....',
      '....yyryryy.....',
      '...hhhhhhhhh....',
      '...hsssssssh....',
      '...hsksssksh....',
      '....ssmmmss.....',
      '.....sssss......',
      '..WWWWWWWWWWW...',
      '.cccWWWWWWWccc..',
      '.cccbbbyybbbccc.',
      '.ccsbbbbbbbsccc.',
      '.cccbbbbbbbbccc.',
      '.cccBBB..BBBccc.',
      '....kk....kk....',
    ],
  },
  witch: {
    pal: { v: '#7a4fd0', V: '#4a2f8a', y: '#ffe14d', h: '#3a2a55', s: '#b9e29a', k: '#1a1030', m: '#7a1f2b', c: '#c68642', b: '#7dff9a', B: '#1fa84f' },
    grid: [
      '.......vv.......',
      '......vvvv......',
      '.....vvvvvv.....',
      '....vvvyyvvv....',
      '...vvvvvvvvvv...',
      '.vvvvvvvvvvvvvv.',
      '..hhsssssssshh..',
      '..hhsksssksshh..',
      '..hhssmmmsshh...',
      '..hh.sssss.hh.c.',
      '...vvvvvvvv..Bb.',
      '..vvvvVvvvvsBbb.',
      '..vvvvVvvvv.BbB.',
      '...vvvVvvvv..BB.',
      '..vvvvvVvvvvv...',
      '..VVVVVVVVVVV...',
    ],
  },
  jester: {
    pal: { r: '#e0556b', t: '#2fb5b0', y: '#ffe14d', s: '#ffd3a8', k: '#1a1224', m: '#c0392b', W: '#ffffff', w: '#d5d9e4' },
    grid: [
      '.y............y.',
      '.rr..........tt.',
      '..rrr......ttt..',
      '..rrrrrttttttt..',
      '...rrrrtttttt...',
      '...yyyyyyyyyy...',
      '....sssssssss...',
      '....sksssssks...',
      '....sssmmmsss...',
      '.....sssssss....',
      '..WwWwWwWwWwW...',
      '..rrrrrttttttt..',
      '.srrrrrttttttts.',
      '.srrrrrttttttts.',
      '...rrr....ttt...',
      '..ykk......kky..',
    ],
  },
};

export { SPRITES };

export function roleSprite(role, { scale = 4 } = {}) {
  const def = SPRITES[role];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute('width', String(SIZE * scale));
  svg.setAttribute('height', String(SIZE * scale));
  svg.setAttribute('class', `sprite sprite-${role}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.style.imageRendering = 'pixelated';
  if (!def) return svg;
  def.grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const fill = def.pal[row[x]];
      if (!fill) continue;
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
      r.setAttribute('width', '1'); r.setAttribute('height', '1');
      r.setAttribute('fill', fill);
      svg.append(r);
    }
  });
  return svg;
}
