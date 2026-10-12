// 간단한 CSV 파서 (따옴표/개행/이스케이프 처리)
function parseCSV(s) {
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const rows = [];
  let r = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      r.push(f); f = ''; rows.push(r); r = [];
    } else f += c;
  }
  if (f !== '' || r.length) { r.push(f); rows.push(r); }
  return rows.filter(x => x.some(v => v.trim() !== ''));
}
module.exports = { parseCSV };
