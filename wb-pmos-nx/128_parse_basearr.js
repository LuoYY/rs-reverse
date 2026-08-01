/**
 * 128_parse_basearr.js
 *
 * 解析浏览器权威 basearr（多会话）的分段结构（numarrJoin 全前缀布局）
 * 找固定段 vs 会话相关段 → 动态生成 basearr
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

function parseSegments(basearr) {
  // 全前缀：scalar, len, data, scalar, len, data, ...
  const segs = [];
  let i = 0;
  if (basearr.length < 2) return segs;
  // 第一段可能无长度前缀（不同版本）——先假设有
  const first = basearr[0];
  if (typeof first === 'number') {
    const len = basearr[1];
    if (len !== undefined && 2 + len <= basearr.length) {
      segs.push({ type: 'START', len, data: basearr.slice(2, 2 + len) });
      i = 2 + len;
      while (i + 2 <= basearr.length) {
        const type = basearr[i];
        const l = basearr[i + 1];
        if (l === undefined || i + 2 + l > basearr.length) { segs.push({ type, len: '?', data: basearr.slice(i) }); break; }
        segs.push({ type, len: l, data: basearr.slice(i + 2, i + 2 + l) });
        i += 2 + l;
      }
    }
  }
  return segs;
}

(async () => {
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('basearr_') && f.endsWith('.json'));
  const all = [];
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
      if (d.basearr && Array.isArray(d.basearr)) {
        all.push({ file: f, nsd: d.challenge?.nsd, basearr: d.basearr, keys2: d.keys2 });
      }
    } catch (e) {}
  }
  console.log('basearr 会话数:', all.length);
  for (const a of all) {
    console.log(`\n=== ${a.file} nsd=${a.nsd} basearr len=${a.basearr.length} ===`);
    console.log('前 30:', a.basearr.slice(0, 30).join(','));
    const segs = parseSegments(a.basearr);
    console.log('分段:', segs.map(s => `${s.type}(len${s.len})`).join(' '));
    segs.forEach((s, i) => console.log('  [' + i + '] ' + s.type + ' len=' + s.len, '前8:', s.data.slice(0, 8).join(',')));
  }
  // 对比固定段 vs 变化段
  if (all.length >= 2) {
    console.log('\n=== 段对比 ===');
    const minSegs = Math.min(...all.map(a => parseSegments(a.basearr).length));
    for (let si = 0; si < minSegs; si++) {
      const datas = all.map(a => parseSegments(a.basearr)[si].data);
      const lens = all.map(a => parseSegments(a.basearr)[si].len);
      const types = all.map(a => parseSegments(a.basearr)[si].type);
      const sameLen = lens.every(l => l === lens[0]);
      let sameData = sameLen && datas[0].length > 0;
      if (sameData) {
        for (let di = 1; di < datas.length; di++) {
          if (datas[di].length !== datas[0].length || !datas[di].every((v, j) => v === datas[0][j])) { sameData = false; break; }
        }
      }
      console.log(`段[${si}] type=${types.join('/')} len=${lens.join('/')} ${sameLen ? '' : '(长度变)'} ${sameData ? '★固定' : '会话相关'} 样例: ${datas[0].slice(0, 10).join(',')}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
