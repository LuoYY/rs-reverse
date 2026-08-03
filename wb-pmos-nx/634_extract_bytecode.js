/**
 * 634_extract_bytecode.js
 * 提取外层 JS 末尾调用的 _$_$ bytecode 池 + 反编译 basearr 生成子程序
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const code = fs.readFileSync(OUTER_JS, 'utf8');

// 找末尾的 IIFE 调用
const end = code.lastIndexOf(');');
const callStart = code.lastIndexOf('(function(_$dX,_$_$){');
if (callStart < 0) { console.log('入口未找到'); process.exit(1); }
// 从入口函数的函数体结束（第5行函数定义），找调用括号
// 入口: (function(_$dX,_$_$){ ... }, 末尾: ...]);
const fnEnd = code.lastIndexOf('},', end);
console.log('调用起始:', callStart, '函数结束:', fnEnd, '调用结束:', end);
const callBody = code.substring(fnEnd + 2, end + 1);
console.log('调用参数片段:', callBody.substring(0, 200));
console.log('调用参数长度:', callBody.length);

// 解析参数数组（用简易括号匹配找顶层数组）
function parseTopArrays(s) {
  const arrs = [];
  let i = 0;
  while (i < s.length) {
    // 找 [
    if (s[i] === '[') {
      let depth = 0, j = i, inStr = null;
      for (; j < s.length; j++) {
        const ch = s[j];
        if (inStr) { if (ch === inStr && s[j - 1] !== '\\') inStr = null; continue; }
        if (ch === '"' || ch === "'") { inStr = ch; continue; }
        if (ch === '[') depth++;
        else if (ch === ']') { depth--; if (depth === 0) { break; } }
      }
      const raw = s.substring(i, j + 1);
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arrs.push(parsed);
      } catch (e) {
        // 尝试替换 undefined
        try {
          const cleaned = raw.replace(/undefined/g, '0');
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) arrs.push(parsed);
        } catch (e2) { console.log('解析失败 @', i, e2.message.substring(0, 30)); }
      }
      i = j + 1;
    } else if (s[i] === ',') { i++; }
    else if (s[i] === '(' || s[i] === ')') { i++; }
    else if (/[0-9]/.test(s[i]) || s[i] === '-' || s[i] === '.' || /[a-zA-Z_$]/.test(s[i])) {
      // 跳过标量
      let j = i;
      while (j < s.length && /[0-9a-zA-Z_$.\-]/.test(s[j])) j++;
      i = j;
    } else { i++; }
  }
  return arrs;
}

// 提取第一个非数组参数（_$dX）和后续数组（_$_$）
const args = parseTopArrays(callBody);
console.log('数组参数数:', args.length);
args.forEach((a, i) => {
  if (Array.isArray(a) && a.length > 0 && typeof a[0] === 'number') {
    console.log(`  池#${i}: len=${a.length} 头=${a.slice(0, 10).join(',')}`);
  } else if (Array.isArray(a)) {
    console.log(`  池#${i}: len=${a.length} 首元素类型=${typeof a[0]}`);
  }
});
// 保存池
fs.writeFileSync('/tmp/nx_bytecode_pool.json', JSON.stringify(args));
console.log('已保存 /tmp/nx_bytecode_pool.json');
