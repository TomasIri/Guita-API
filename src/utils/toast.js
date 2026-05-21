let timer;

/**
 * Show a brief notification at the top of the screen.
 * @param {string} msg  - Message to display.
 * @param {'ok'|'err'|'warn'|''} type - Visual variant.
 */
export function toast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show${type ? ' ' + type : ''}`;
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), 2600);
}
