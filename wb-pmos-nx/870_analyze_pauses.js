/**
 * 870_analyze_pauses.js
 * 分析所有 pause 的参数（安全解析）
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/nx_c4_all_pauses.json', 'utf8'));

function safeParse(v) {
  if (!v || v === 'undef' || v === 'err') return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}

d.forEach(c => {
  const pL = safeParse(c.data.pL);
  const ez = safeParse(c.data.ez);
  const gc = safeParse(c.data.gc);
  const pb = safeParse(c.data.pb);
  const nx = safeParse(c.data.nx);
  const cQ = safeParse(c.data.cQ);
  console.log('pause#' + c.pause + ' fn=' + c.fn +
    ' pL=' + (pL ? pL.length : 'undef') +
    ' ez=' + (ez ? ez.length : 'undef') +
    ' gc=' + (gc ? gc.length : 'undef') +
    ' pb=' + (pb ? pb.length : 'undef') +
    ' nx=' + (nx ? nx.length : 'undef') +
    ' cQ=' + (cQ ? cQ.length : 'undef'));
});