/**
 * 232_parse_nextarr_segs.js
 *
 * 解析浏览器 nextarr 段结构（numarrJoin 模式），确定 basearrEncrypt 边界
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

(async () => {
  const f = fs.readdirSync(OUT).filter(x => x.startsWith('browser_nextarr_')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  const nextarr = d.nextarr;
  console.log('nextarr len:', nextarr.length);
  console.log('完整:', JSON.stringify(nextarr));

  // 已知结构：[4][8][X 8B][48][keys2 48B] = 59B
  // 从 59 开始解析 numarrJoin 段
  let p = 59;
  console.log('\n从位置 59 解析:');
  while (p < nextarr.length) {
    const h = nextarr[p];
    if (h < 16 || h > 250) { console.log('  @' + p + ': 非长度标记? h=' + h); break; }
    const seg = nextarr.slice(p + 1, p + 1 + h);
    console.log('  @' + p + ' len=' + h + ' 段数据前 8:', seg.slice(0, 8).join(',') || '(空)', '段长实际:' + seg.length);
    if (p + 1 + h >= nextarr.length) break;
    p += 1 + h;
  }

  // 也检查 jsdom 的 nextarr（对比）
  console.log('\n=== jsdom 对比 ===');
  const trapFile = fs.readdirSync(OUT).filter(x => x.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];
  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  if (plain) {
    const n2 = plain.slice(4);
    console.log('jsdom nextarr len:', n2.length);
    console.log('jsdom nextarr:', JSON.stringify(n2.slice(0, 80)));
    let q = 59;
    while (q < n2.length) {
      const h = n2[q];
      if (h < 16 || h > 250) { console.log('  @' + q + ': 非长度? h=' + h); break; }
      console.log('  @' + q + ' len=' + h + ' 段前 8:', n2.slice(q + 1, q + 1 + Math.min(8, h)).join(','));
      q += 1 + h;
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
