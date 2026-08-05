// 在 317B 样本里搜索 numarrJoin tag 序列（3/10/7/0/6/2/9/13）
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/handler/basearr/len243-nx.js'), 'utf8');
  const m = src.match(/const NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
  const s = m[1].split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
  console.log('len:', s.length);

  // 搜索 tag 值出现位置
  for (const tag of [3, 10, 7, 0, 6, 2, 9, 13]) {
    const pos = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === tag) {
        // 检查后一个字节是否像长度（1-100）
        if (i + 1 < s.length && s[i + 1] > 0 && s[i + 1] < 120) pos.push(i);
      }
    }
    if (pos.length) console.log(`tag ${tag}: @ ${pos.slice(0, 10)}`);
  }

  // 尝试从每个可能的 3 位置解析完整 numarrJoin
  const tag3s = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === 3 && i + 1 < s.length && s[i + 1] > 0 && s[i + 1] < 120) tag3s.push(i);
  }
  console.log('\ntag=3 候选:', tag3s.slice(0, 10));
  for (const start of tag3s) {
    let idx = start;
    const segs = [];
    let ok = true;
    const tags = [3, 10, 7, 0, 6, 2, 9, 13];
    let ti = 0;
    while (idx < s.length && ti < tags.length) {
      if (s[idx] !== tags[ti]) { ok = false; break; }
      const len = s[idx + 1];
      if (len === 0 || idx + 2 + len > s.length) { ok = false; break; }
      segs.push({ tag: tags[ti], len, data: s.slice(idx + 2, idx + 2 + Math.min(len, 8)) });
      idx += 2 + len;
      ti++;
    }
    if (ok && segs.length >= 4) {
      console.log(`\n★★★ 完整解析 @${start}: ${segs.map(x => `tag${x.tag}(len${x.len})`).join(' → ')}`);
      console.log('  剩余:', s.slice(idx).join(','));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
