/**
 * 32_extract_funcs.js
 *
 * 从当前会话动态代码提取 plain24 构造函数源码
 * 调用链：_$_k(as _$db)@37578 → _$gg@38664 → VM(_$hE@46763) → ...
 * 动态代码 <anonymous>:2:COL → 绝对偏移 = 第1行长度(162430) + 1 + COL
 */
const fs = require('fs');
const path = require('path');

const f = fs.readdirSync(path.join(__dirname, 'captures')).filter(x => x.startsWith('plain24_script_')).sort().pop();
const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'captures', f), 'utf8'));
const dyn = d.sources[0].source;
console.log('动态代码长度:', dyn.length);

// 换行位置
const newlines = [];
let idx = dyn.indexOf('\n');
while (idx >= 0) { newlines.push(idx); idx = dyn.indexOf('\n', idx + 1); }
console.log('换行符数量:', newlines.length, '前几个:', newlines.slice(0, 8));

function absOffset(line, col) {
  // line 从 1 开始，col 为该行内列偏移（0-based? V8 的 col 是 0-based 列位置）
  let off = 0;
  for (let i = 0; i < line - 1; i++) off += newlines[i] + 1;
  return off + col;
}

// 调用链帧 (col 是行内列偏移)
const frames = [
  { fn: '_$_k (as _$db)', line: 2, col: 37578 },
  { fn: '_$gg', line: 2, col: 38664 },
  { fn: '_$hE (VM)', line: 2, col: 46763 },
  { fn: '_$gN (VM)', line: 2, col: 41868 },
  { fn: '_$hE (VM)', line: 2, col: 46620 },
];

function extractFunction(src, absOff) {
  // 向后找最近的 "function " 定义
  let idx = absOff;
  while (idx > 0) {
    const fIdx = src.lastIndexOf('function', idx);
    if (fIdx < 0) break;
    // 粗略找函数体结束（大括号匹配）
    const bodyStart = src.indexOf('{', fIdx);
    if (bodyStart > 0 && bodyStart < absOff) {
      let depth = 0;
      for (let i = bodyStart; i < src.length && i < bodyStart + 30000; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return { start: fIdx, end: i + 1, code: src.substring(fIdx, i + 1) }; }
      }
      return { start: fIdx, end: bodyStart + 20000, code: src.substring(fIdx, bodyStart + 20000) };
    }
    idx = fIdx - 1;
  }
  return null;
}

for (const fr of frames) {
  const absOff = absOffset(fr.line, fr.col);
  console.log(`\n\n########## ${fr.fn} @<anonymous>:${fr.line}:${fr.col} (绝对偏移 ${absOff}) ##########`);
  const fn = extractFunction(dyn, absOff);
  if (fn) {
    console.log(`函数范围 [${fn.start}..${fn.end}] 长度 ${fn.end - fn.start}`);
    console.log('='.repeat(80));
    console.log(fn.code.substring(0, 6000));
  } else {
    console.log('未找到函数定义，显示上下文:');
    console.log(dyn.substring(Math.max(0, absOff - 400), absOff + 800));
  }
}
process.exit(0);
