/**
 * 406_inner_func.js
 * 分析环境采集函数（_$jF/_$$8 等）函数体 + Unicode 编码的属性名字符串
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

// Unicode 转义字符串（\xNN 形式）
console.log('=== Unicode 转义字符串（含 doc/mode 关键）===');
const unicode = code.match(/\\x[0-9a-f]{2}/gi);
console.log('\\xNN 总数:', unicode ? unicode.length : 0);
// 解码所有 \xNN 序列看是否拼出 documentMode
const dec = code.replace(/\\x([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
const dm = dec.match(/documentMode|documentElement|compatMode|doScroll/g);
console.log('解码后 documentMode 等:', dm ? dm.slice(0, 10) : '无');

// 搜 function 定义（当前会话）
console.log('\n=== function 定义 ===');
const reF = /function\s+([_$]\w+)/g;
let m, count = 0;
while ((m = reF.exec(code)) !== null) {
  count++;
  if (count <= 5) {
    const idx = m.index;
    console.log(`#${count} ${m[1]} @${idx}:`, code.substring(idx, idx + 100).replace(/\n/g, ' '));
  }
}
console.log('函数总数:', count);

// 搜所有含大量 [变量][变量[N]] 索引访问的代码（环境采集特征）
console.log('\n=== 环境采集特征（读 document 属性）===');
const envReads = code.match(/[_$\w]+\[[_$\w]+\[[0-9]+\]\]/g);
console.log('环境读取:', envReads ? envReads.slice(0, 10) : '无');
