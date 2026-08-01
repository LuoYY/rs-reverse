/**
 * 171_search_dyn_array.js
 *
 * 搜索 dynCode 里的数组字面量（64 个字符代码）——basestr 可能是字符代码数组
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

(async () => {
  // dynCode
  const dyn = fs.existsSync('/tmp/nx_dyncode.js') ? fs.readFileSync('/tmp/nx_dyncode.js', 'utf8') : null;
  if (!dyn) {
    const sync = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/sync_1785512612887.json')));
    const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
    const outer = fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8');
    const r = runOuterVM({ nsd: sync.challenge.nsd, cd: sync.challenge.cd }, outer);
    fs.writeFileSync('/tmp/nx_dyncode.js', r.dynCode);
    console.log('dynCode 生成');
  }
  const code = fs.readFileSync('/tmp/nx_dyncode.js', 'utf8');
  console.log('dynCode len:', code.length);

  // 搜索字符代码数组：[48,49,...] 或 [0x2d,...] 长数组
  const re = /\[(\d{1,3},\s*){55,100}\]/g;
  let m, count = 0;
  const candidates = [];
  while ((m = re.exec(code)) !== null && count < 200) {
    const arr = m[0].slice(1, -1).split(',').map(s => parseInt(s.trim(), 10));
    // basestr 特征：64 个可打印字符（32-126），含 - (45) 和 _ (95)
    if (arr.length >= 60 && arr.length <= 68) {
      const allPrintable = arr.every(v => v >= 32 && v <= 126);
      const hasDash = arr.includes(45);
      const hasUnderscore = arr.includes(95);
      if (allPrintable && hasDash && hasUnderscore) {
        const str = arr.map(v => String.fromCharCode(v)).join('');
        candidates.push({ pos: m.index, arr, str });
      }
    }
    count++;
  }
  console.log('数组字面量扫描数:', count, 'basestr 候选:', candidates.length);
  candidates.forEach(c => console.log('  @' + c.pos, 'len=' + c.arr.length, JSON.stringify(c.str)));

  // 如果没找到，搜索含 - (45) 的 64 字符代码数组（宽松）
  if (!candidates.length) {
    const re2 = /\[(\d{1,3},\s*){60,70}\]/g;
    let m2, c2 = 0;
    const cands2 = [];
    while ((m2 = re2.exec(code)) !== null && c2 < 500) {
      const arr = m2[0].slice(1, -1).split(',').map(s => parseInt(s.trim(), 10));
      if (arr.includes(45)) {
        const str = arr.map(v => String.fromCharCode(v)).join('');
        const printableRatio = arr.filter(v => v >= 32 && v <= 126).length / arr.length;
        if (printableRatio > 0.9) cands2.push({ pos: m2.index, arr, str });
      }
      c2++;
    }
    console.log('宽松候选:', cands2.length);
    cands2.slice(0, 10).forEach(c => console.log('  @' + c.pos, 'len=' + c.arr.length, JSON.stringify(c.str.substring(0, 70))));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
