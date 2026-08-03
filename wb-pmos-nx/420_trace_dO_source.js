/**
 * 420_trace_dO_source.js
 * 离线分析刚捕获的动态代码（/tmp/nx_dyncode_raw.js，nsd=102475 同会话）：
 * 1. 解码 _$n9[177] 属性名（确认是否 documentMode）
 * 2. 追踪 _$dO 的所有赋值来源（op45 宿主对象）
 * 3. 找 _$n9 数组定义解码
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');
console.log('dynCode len:', code.length);

// ========== 1. 找 op44/op45 区域 ==========
const i45 = code.indexOf('_$n9[177]');
console.log('\n=== _$n9[177] 使用位置 ===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('_$n9[177]', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(idx - 90, idx + 60).replace(/\n/g, ' ')}`);
  idx += 9;
}
console.log('使用次数:', cnt);

// ========== 2. 找 _$n9 数组定义 ==========
const arrDefRe = /_\$n9=\[/;
const am = code.match(arrDefRe);
if (am) {
  // 提取数组
  let i = am.index + am[0].length;
  let depth = 0, s = '';
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { s += c; break; } }
    if (depth > 0) s += c;
  }
  console.log('\n=== _$n9 数组定义（前 300）===');
  console.log(s.substring(0, 300));
  // 解码所有字符串元素
  const elems = [];
  const re = /'([^']*)'/g;
  let m;
  while ((m = re.exec(s)) !== null) elems.push(m[1]);
  console.log('字符串元素数:', elems.length);
  const rev = x => x.split('').reverse().join('');
  // 找 [177] 附近元素
  console.log('\n=== 元素 170-185 ===');
  for (let j = 170; j <= 185; j++) {
    if (elems[j] !== undefined) {
      const e = elems[j];
      console.log(`[${j}] '${e}' → rev: '${rev(e)}'`);
    }
  }
} else {
  console.log('无 _$n9=[ 定义，搜其他定义形式');
  // 搜 _$n9 所有赋值
  const re2 = /_\$n9\s*=[^;]{0,60}/g;
  let m2, c2 = 0;
  while ((m2 = re2.exec(code)) !== null && c2 < 8) { console.log(`@${m2.index}: ${m2[0]}`); c2++; }
}

// ========== 3. 追踪 _$dO 赋值来源 ==========
console.log('\n=== _$dO 所有赋值 ===');
const dORe = /_\$dO\s*=[^;]{0,80}/g;
let dm, c3 = 0;
while ((dm = dORe.exec(code)) !== null && c3 < 15) {
  console.log(`@${dm.index}: ${dm[0]}`);
  c3++;
}
if (c3 === 0) console.log('未找到 _$dO 赋值');

// ========== 4. op44 debugger 区域（反调试）==========
const dbg = code.indexOf('debugger;');
if (dbg >= 0) {
  console.log('\n=== debugger 使用（前 5 个）===');
  let d = 0, di = 0;
  while ((di = code.indexOf('debugger;', di)) !== -1 && d < 5) {
    console.log(`@${di}: ${code.substring(di - 80, di + 40).replace(/\n/g, ' ')}`);
    di += 9; d++;
  }
} else {
  console.log('\n无 debugger;');
}
