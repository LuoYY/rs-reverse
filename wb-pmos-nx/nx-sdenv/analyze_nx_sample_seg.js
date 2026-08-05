// 分析 317B 样本的 seg 结构（numarrJoin 布局）
const fs = require('fs');
const path = require('path');
require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));

(async () => {
  // 提取样本
  const src = fs.readFileSync(path.join(__dirname, '../../src/handler/basearr/len243-nx.js'), 'utf8');
  const m = src.match(/const NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
  const sample = m[1].split(',').map(x => parseInt(x.trim()));
  console.log('样本 len:', sample.length);

  // numarrJoin 布局解析: [tag, len, data] 交替，首 tag=3
  // 尝试从不同偏移
  for (let start = 0; start < 5; start++) {
    let idx = start;
    const segs = [];
    let ok = true;
    while (idx + 1 < sample.length) {
      const tag = sample[idx];
      if (![3, 10, 7, 0, 6, 2, 9, 13].includes(tag)) { ok = false; break; }
      const ln = sample[idx + 1];
      if (ln === 0 || idx + 2 + ln > sample.length) { ok = false; break; }
      segs.push({ at: idx, tag, len: ln, data: sample.slice(idx + 2, idx + 2 + Math.min(ln, 15)) });
      idx += 2 + ln;
    }
    if (ok && segs.length >= 3) {
      console.log(`\n★★★ start=${start} 解析成功! ${segs.length} 段, 覆盖 ${idx}/${sample.length}`);
      segs.forEach(s => console.log(`  @${s.at} tag=${s.tag} len=${s.len}: [${s.data}]`));
      console.log('剩余:', sample.slice(idx));
    }
  }

  // 也尝试: 首字节 176 是否是 [flag] 前缀（nx hasDebug）
  console.log('\n前 10:', sample.slice(0, 10).join(','));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
