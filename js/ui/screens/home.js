import { h } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { GAME_TITLE } from '../../config.js';

export function homeScreen(ctx) {
  const { prefill, error, resumeAvailable } = ctx;
  const name = h('input', { id: 'name', type: 'text', maxlength: '20', placeholder: t('home.yourName'), autocomplete: 'nickname', value: prefill.name ?? '', 'aria-label': t('home.yourName') });
  const code = h('input', { id: 'code', type: 'text', maxlength: '4', placeholder: 'ABCD', autocapitalize: 'characters', autocomplete: 'off', value: prefill.code ?? '', 'aria-label': t('home.code'), class: 'code-input' });
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
      h('button', { class: 'btn primary', onClick: () => needName() && ctx.onHost(name.value.trim()) }, t('home.host')),
    ),
    h('div', { class: 'card' },
      h('label', null, t('home.code'), code),
      h('button', { class: 'btn', onClick: () => {
        const c = code.value.trim().toUpperCase();
        if (c.length !== 4) { code.focus(); code.classList.add('bad'); return; }
        needName() && ctx.onJoin(c, name.value.trim());
      } }, t('home.join')),
    ),
  );
}
