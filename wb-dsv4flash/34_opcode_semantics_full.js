/**
 * 34_opcode_semantics_full.js
 *
 * 递归解析 VM dispatcher 的二叉 if 树，提取每个操作码的完整处理代码
 */
const fs = require('fs');
const path = require('path');

const f = fs.readdirSync(path.join(__dirname, 'captures')).filter(x => x.startsWith('plain24_script_')).sort().pop();
const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'captures', f), 'utf8'));
const dyn = d.sources[0].source;
const vmSrc = dyn.substring(42001, 50853);

// 解析 if(_$_6<=N) X else Y 的紧凑结构
// 结构示例: if(_$_6<=63)if(_$_6<=15)...else if(_$_6<=75)...
// 递归解析：
function parseDispatchers(src) {
  const results = []; // {op, code}
  // 提取 dispatcher 主体：function _$hE(...){...} 的循环体
  // 我们从 _$_6 的分发开始
  let pos = src.indexOf('for(_$ik=_$_0;');
  if (pos < 0) { console.log('未找到循环体'); return results; }
  pos = src.indexOf('{', pos);
  // 跳过 for 循环头
  // 找到 if(_$_6<= 开始
  const body = src.substring(pos + 1);
  parseNode(body, results, 'root');
  return results;
}

function parseNode(code, results, indent) {
  // 匹配 if(_$_6<=N) 然后取分支体
  // 用递归下降
  const m = code.match(/^if\(_\$_6<=(\d+)\)([\s\S]*)/);
  if (!m) {
    // 可能是 else if 或 else 或普通表达式
    const m2 = code.match(/^if\(_\$_6<=(\d+)\)/);
    if (m2) {
      const op = +m2[1];
      const rest = code.substring(m2[0].length);
      // 取到匹配的 else 前的表达式
      const branch = extractBranch(rest);
      results.push({ op, code: branch });
      // 递归剩余
      const remain = rest.substring(branch.fullLen);
      if (remain.trim()) parseNode(remain.trim(), results, indent);
    }
    return;
  }
  const op = +m[1];
  const rest = code.substring(m[0].length);
  // 这个 if 的 then 分支 = 到对应的 else 之前的表达式
  // 紧凑形式：cond?expr:expr 或 cond?expr:rest
  // 我们的 dispatcher 是 if(...)EXPR;else if(...)EXPR;...
  // 找分支边界：匹配到 ";else if(" 或 ");" 结束
  const branch = extractBranchUntilElse(rest);
  results.push({ op, code: branch.content });
  // 剩余 = else 之后
  let remain = rest.substring(branch.endIdx);
  if (remain.startsWith(';else')) remain = remain.substring(5);
  if (remain.startsWith('if(')) {
    parseNode(remain, results, indent);
  }
}

function extractBranchUntilElse(code) {
  // 找 ";else if(" 的位置作为分支结束
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    else if (ch === ';' && depth === 0) {
      const rest = code.substring(i + 1);
      if (rest.startsWith('else')) return { content: code.substring(0, i), endIdx: i + 1, rest };
    }
  }
  return { content: code, endIdx: code.length, rest: '' };
}

// 由于结构复杂，用更简单的扫描法：直接按 "_$_6<=N?" 标记 + 括号配对提取
function extractOpHandlers(src) {
  // 找每个 op 的完整 handler：从 "opN" 的代码到 ":" 或 ")" 或 ";"
  const handlers = {};
  // 用 dispatcher 源码中每个 op 的形态
  // opN handler 是三元表达式的最内层叶子
  // 简化：提取所有 `_$_6<=N?` 的位置，每个 handler = 从该位置到匹配的 ":"（同一层）
  const re = /_\$_6<=(\d+)\?/g;
  let m;
  const marks = [];
  while ((m = re.exec(src))) marks.push({ op: +m[1], idx: m.index + m[0].length });
  // 每个 op 的 handler 到下一个同层 ":" 或 ")"
  marks.forEach((mk, i) => {
    // 从 mk.idx 开始，找匹配的 ':' (depth 0)
    let depth = 0;
    let end = src.length;
    for (let j = mk.idx; j < src.length; j++) {
      const ch = src[j];
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
      else if (ch === ':' && depth === 0) { end = j; break; }
      else if (ch === ';' && depth === 0) { end = j; break; }
      else if (ch === '?' && depth === 0) { end = j; break; }
    }
    handlers[mk.op] = src.substring(mk.idx, end);
  });
  return handlers;
}

const handlers = extractOpHandlers(vmSrc);
console.log('提取操作码 handler 数:', Object.keys(handlers).length);
const sortedOps = Object.keys(handlers).map(Number).sort((a, b) => a - b);

// 保存
fs.writeFileSync(path.join(__dirname, 'opcode_semantics_v3.json'), JSON.stringify(handlers, null, 2));

// 打印 206 字节码用到的操作码语义
const bc = [38,1,10,5,2,1,3,30,3,32,4,39,26,40,1,1,7,11,42,10,5,3,29,3,32,65,38,0,27,27,1,1,32,65,38,0,27,27,12,26,13,32,61,38,23,27,10,5,2,29,3,10,21,1,1,2,7,14,30,10,21,2,1,0,39,26,4,62,10,21,0,62,29,2,63,10,5,4,29,4,1,0,15,11,123,32,61,38,23,27,7,11,221,10,5,5,29,4,29,5,15,11,123,1,1,32,65,38,0,27,27,32,61,38,59,27,79,26,12,1,1,29,5,32,61,38,59,27,57,11,157,29,4,1,1,61,11,103,38,0,68,11,165,15,11,123,1,2,7,14,30,10,21,2,29,4,7,11,78,10,5,6,62,10,5,7,29,7,29,6,15,11,75,29,7,29,4,15,11,88,1,2,26,10,29,7,1,2,31,11,165,10,5,7,32,65,38,65,27,29,7,7,11,109,43,34];
const usedOps = [...new Set(bc)];
console.log('\n=== 206 字节码用到的操作码语义 ===');
for (const op of usedOps.sort((a, b) => a - b)) {
  console.log(`\nop${op}: ${handlers[op] ? handlers[op].substring(0, 200) : '(未提取)'}`);
}
process.exit(0);
