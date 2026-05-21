const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };

/** Escape user-supplied strings before inserting into innerHTML. */
export function escapeHTML(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => MAP[c]);
}

/** Wrap a value in a quoted CSV field, doubling any internal quotes. */
export function csvField(value) {
  const s = String(value ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
