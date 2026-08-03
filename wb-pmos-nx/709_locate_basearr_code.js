/**
 * 709_locate_basearr_code.js
 * 静态定位 basearr 构造代码（固定 dynCode #1）：
 * 调用栈 <anonymous>:1:10567 = _$pj（push basearr[25-28]）
 * 提取列偏移处上下文 + _$pj/_$nE/_$dh 函数定义
 */
const fs = require('fs');

(async () => {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_fixed_dataset.json', 'utf8'));
  const dyn = d.dyn.find(s => s.sha === '3382c27dacf7d1a4');
  if (!dyn) { console.log('未找到 dynCode #1'); process.exit(1); }
  const src = dyn.source;
  console.log('dynCode #1 len:', src.length);

  // 调用栈列偏移
  const offs = [
    { name: '_$pj(push)', col: 10567 },
    { name: '_$nE', col: 66823 },
    { name: '_$dh', col: 62558 },
    { name: '_$nE#2', col: 63318 },
    { name: '_$nE#3', col: 68631 },
  ];

  console.log('\n=== 列偏移上下文 ===');
  for (const o of offs) {
    const start = Math.max(0, o.col - 60);
    const end = Math.min(src.length, o.col + 80);
    console.log(`\n--- ${o.name} @${o.col} ---`);
    console.log(src.substring(start, end).replace(/\n/g, '\\n'));
  }

  // 找函数定义
  console.log('\n=== 函数定义定位 ===');
  for (const fn of ['_$pj', '_$nE', '_$dh']) {
    const idxs = [];
    let idx = -1;
    while ((idx = src.indexOf(fn, idx + 1)) !== -1) {
      // 只看 function 定义
      const pre = src.substring(Math.max(0, idx - 20), idx);
      if (pre.includes('function')) idxs.push(idx);
      if (idxs.length >= 3) break;
    }
    console.log(`function ${fn} 定义位置: ${idxs.join(', ') || '无'}`);
    if (idxs[0]) {
      // 提取函数体（括号匹配）
      const start = src.lastIndexOf('function', idxs[0]);
      let brace = src.indexOf('{', start);
      let depth = 0, inStr = null, end = -1;
      for (let i = brace; i < src.length; i++) {
        const ch = src[i];
        if (inStr) { if (ch === inStr && src[i - 1] !== '\\') inStr = null; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      const body = src.substring(start, end + 1);
      console.log(`  len=${body.length}`);
      fs.writeFileSync(`/tmp/nx_fn_${fn}.js`, body);
      console.log(`  已保存 /tmp/nx_fn_${fn}.js`);
    }
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
