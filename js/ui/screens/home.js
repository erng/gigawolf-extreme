import { h } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { GAME_TITLE, ROOM_CODE_LENGTH, normalizeRoomCode, formatRoomCode } from '../../config.js';

export function homeScreen(ctx) {
  const { prefill, error, resumeAvailable } = ctx;
  const name = h('input', { id: 'name', type: 'text', maxlength: '20', placeholder: t('home.yourName'), autocomplete: 'nickname', value: prefill.name ?? '', 'aria-label': t('home.yourName') });
  const code = h('input', { id: 'code', type: 'text', maxlength: String(ROOM_CODE_LENGTH + 1), placeholder: formatRoomCode('ABCDEFGH'), autocapitalize: 'characters', autocomplete: 'off', value: formatRoomCode(normalizeRoomCode(prefill.code)), 'aria-label': t('home.code'), class: 'code-input',
    // Re-chunk as you type or paste (ABCD-EFGH); typing the dash is optional.
    onInput: () => { const v = formatRoomCode(normalizeRoomCode(code.value)); if (v !== code.value) code.value = v; } });
  const needName = () => {
    if (!name.value.trim()) { name.focus(); name.classList.add('bad'); return false; }
    name.classList.remove('bad'); return true;
  };
  return h('main', { class: 'screen home' },
    h('h1', null, GAME_TITLE),
    h('p', { class: 'sub' }, t('home.sub')),
    error && h('p', { class: 'error', role: 'alert' }, error.startsWith('main.') ? t(error) : tr(error)),
    resumeAvailable && h('button', { class: 'btn primary', onClick: () => ctx.onResume() }, t('home.resume')),
    h('label', null, t('home.name'), name),
    h('div', { class: 'card' },
      h('label', null, t('home.code'), code),
      h('button', { class: 'btn primary', onClick: () => {
        const c = normalizeRoomCode(code.value);
        if (c.length !== ROOM_CODE_LENGTH) { code.focus(); code.classList.add('bad'); return; }
        needName() && ctx.onJoin(c, name.value.trim());
      } }, t('home.join')),
    ),
    h('button', { class: 'btn', onClick: () => needName() && ctx.onHost(name.value.trim()) }, t('home.host')),
  );
}
