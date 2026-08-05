// 用 numarrJoin 逆逻辑解析 317B 样本
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/handler/basearr/len243-nx.js'), 'utf8');
  const m = src.match(/const NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
  const s = m[1].split(',').map(x => parseInt(x.trim()));
  console.log('样本 len:', s.length);

  // numarrJoin 逆：第一个数组直接拼接（前缀是第一个 seg 的 tag 或数据）
  // 解析尝试：第一段数据长度 L0（从第一字节推导），后续 [len, data]
  // 试多种 L0（0-20），看能否完整解析到尾部
  for (let L0 = 0; L0 <= 20; L0++) {
    let idx = L0; // 第一段数据 [0:L0]
    const segs = [];
    let ok = true;
    while (idx < s.length) {
      const len = s[idx];
      if (len === 0) { segs.push({ len: 0, data: [] }); idx++; continue; }
      if (idx + 1 + len > s.length) { ok = false; break; }
      segs.push({ len, data: s.slice(idx + 1, idx + 1 + len) });
      idx += 1 + len;
    }
    if (ok && idx === s.length) {
      console.log(`\n★★★ L0=${L0} 解析成功! ${segs.length} 段`);
      console.log('  第一段:', s.slice(0, L0));
      segs.forEach((seg, i) => console.log(`  seg${i + 1} (len=${seg.len}): [${seg.data.slice(0, 15)}]...`));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
