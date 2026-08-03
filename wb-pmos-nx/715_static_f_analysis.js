/**
 * 715_static_f_analysis.js
 * 静态分析固定 dynCode #1：
 * 1. _​$$f 定义（basearr 二次处理）
 * 2. _​$pj / _​$lK 的调用点（_​$dh 来源）
 * 3. basearr 完整生成链路
 */
const fs = require('fs');

(async () => {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_fixed_dataset.json', 'utf8'));
  const dyn = d.dyn.find(s => s.sha === '3382c27dacf7d1a4');
  if (!dyn) { console.log('未找到 dynCode #1'); process.exit(1); }
  const src = dyn.source;
  console.log('dynCode len:', src.length);

  // 1. 找 _​$$f 定义
  console.log('\n=== _​$$f 定义 ===');
  let idx = src.indexOf('function _$$f');
  if (idx < 0) idx = src.indexOf('_$$f=');
  if (idx >= 0) {
    const start = src.lastIndexOf('function', idx);
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
    console.log('_$$f 定义 @' + start + ' len=' + body.length);
    fs.writeFileSync('/tmp/nx_fn_$$f.js', body);
    console.log('已保存 /tmp/nx_fn_$$f.js');
  } else {
    console.log('未找到 function _$$f，搜其他模式');
    const m = src.match(/_?\$\$f[^=]{0,20}=function[^)]*\)/g);
    console.log('匹配:', m ? m.slice(0, 3) : '无');
  }

  // 2. _​$lK 定义（调用 _$pj 的包装）
  console.log('\n=== _​$lK 定义 ===');
  idx = src.indexOf('function _$lK');
  if (idx >= 0) {
    let brace = src.indexOf('{', idx);
    let depth = 0, inStr = null, end = -1;
    for (let i = brace; i < src.length; i++) {
      const ch = src[i];
      if (inStr) { if (ch === inStr && src[i - 1] !== '\\') inStr = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.substring(idx, end + 1);
    console.log('_$lK @' + idx + ':', body);
  } else console.log('未找到 _$lK');

  // 3. _​$lK 的调用点（谁调用，传入什么 = _$dh 来源）
  console.log('\n=== _​$lK / _​$$f 调用点 ===');
  const re = /_?\$\$f\(/g;
  let m, c = 0;
  while ((m = re.exec(src)) !== null) {
    c++;
    const ctx = src.substring(Math.max(0, m.index - 120), m.index + 60);
    if (c <= 8) console.log(`@${m.index}: ...${ctx.replace(/\n/g, '\\n')}...`);
  }
  console.log('_$$f( 调用次数:', c);

  // 4. 找 _​$pj 调用点（_​$dh 参数来源）
  console.log('\n=== _​$pj 调用点 ===');
  const re2 = /_\$pj\(/g;
  let m2, c2 = 0;
  while ((m2 = re2.exec(src)) !== null) {
    c2++;
    const ctx = src.substring(Math.max(0, m2.index - 100), m2.index + 40);
    if (c2 <= 8) console.log(`@${m2.index}: ...${ctx.replace(/\n/g, '\\n')}...`);
  }
  console.log('_$pj( 调用次数:', c2);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
