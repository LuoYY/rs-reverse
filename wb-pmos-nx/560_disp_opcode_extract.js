/**
 * 560_disp_opcode_extract.js
 * 从 nx dynCode 提取 VM dispatcher 操作码语义表（三叉/二叉 if 树解析）
 * 目标：与 xb opcode_semantics_v3.json 对比，判断 nx/xb 操作码表是否兼容
 * 操作码语义是瑞数 VMP 的核心——若兼容则 xb 已反编译的语义可直接用于 nx
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dynFile = process.argv[2] || '/tmp/nx_dyn_full.js';
const code = fs.readFileSync(dynFile, 'utf8');
console.log('dynCode len:', code.length);

// 1. 定位所有 VM dispatcher 函数（4 参数 + while + _\$eB=_\$aB._\$cC 特征）
// 瑞数内层 VM 特征：function(_$aB,_$$i,_$_G,_$cx){ ... _$eB=_$aB._$cC ... for(_$nG=_$$i;...
const dispRe = /function\s+([_$][\w$]*)\s*\(([^)]{1,120})\)\s*\{/g;
let m;
const cands = [];
while ((m = dispRe.exec(code)) !== null) {
  const head = m.index + m[0].length;
  const body = code.substring(head, head + 300);
  // 特征：_$aB._$cC 或 ._$cC= 或 for(...;...;...){ 循环
  if (body.includes('._$cC') || body.includes('_$cC=') || /for\([_$][\w$]+\s*=\s*[_$][\w$]+;/.test(body)) {
    cands.push({ name: m[1], params: m[2], head });
  }
}
console.log('\ndispatcher 候选:', cands.length);
cands.forEach((c, i) => console.log(`#${i}: ${c.name}(${c.params.substring(0, 60)}) @${c.head}`));

// 2. 对每个候选解析操作码分支（三元表达式树）
function extractOpHandlers(body) {
  const handlers = {};
  // 主分发：if(V<=N)X else if(V<=M)Y ...  或  V<=N?X:V<=M?Y:...
  // 找所有 `<=数字` 标记 + 括号配对
  const re = /(?:[_$][\w$]*|[_$][\w$]*\))\s*<=(\d+)\?/g;
  // 更通用：匹配 `,IF<=N?` 或 `if(IF<=N){` 或 `IF<=N?`
  const re2 = /(?:[_$]\w*|\))\s*<=(\d+)\?/g;
  let mm;
  const marks = [];
  while ((mm = re2.exec(body)) !== null) marks.push({ op: +mm[1], idx: mm.index + mm[0].length });
  // 每个 op 的 handler 到匹配的 ':' (depth 0) 或 ';' 或 '?' 
  marks.forEach((mk, i) => {
    let depth = 0;
    let end = body.length;
    for (let j = mk.idx; j < body.length; j++) {
      const ch = body[j];
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
      else if (ch === ':' && depth === 0) { end = j; break; }
      else if (ch === ';' && depth === 0) { end = j; break; }
      else if (ch === '?' && depth === 0) { end = j; break; }
      else if (j - mk.idx > 600) { end = j; break; }
    }
    handlers[mk.op] = body.substring(mk.idx, end).trim().substring(0, 200);
  });
  return handlers;
}

// 3. 找最大 dispatcher（主循环，含最多操作码）
let best = null, bestCnt = 0, bestBody = '';
for (const c of cands) {
  // 提取函数体（括号匹配）
  let i = c.head - 1, stack = 0;
  for (; i < code.length; i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) break; }
  }
  const body = code.substring(c.head, i + 1);
  const handlers = extractOpHandlers(body);
  const cnt = Object.keys(handlers).length;
  console.log(`\n#${c.name}: 提取操作码 ${cnt} 个`);
  if (cnt > bestCnt) { bestCnt = cnt; best = c; bestBody = body; }
}

if (!best) { console.log('无 dispatcher'); process.exit(1); }
console.log('\n=== 主 dispatcher:', best.name, '操作码数:', bestCnt, '===');

// 重新完整解析主 dispatcher
const handlers = extractOpHandlers(bestBody);
const sortedOps = Object.keys(handlers).map(Number).sort((a, b) => a - b);
console.log('操作码列表:', sortedOps.join(','));

// 保存
const outFile = path.join(ROOT, 'wb-pmos-nx/captures/nx_opcode_table.json');
fs.writeFileSync(outFile, JSON.stringify({ name: best.name, ops: sortedOps, handlers }, null, 2));
console.log('已保存:', outFile);

// 4. 与 xb opcode_semantics_v3.json 对比
try {
  const xbSem = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-dsv4flash/opcode_semantics_v3.json')));
  const xbOps = Object.keys(xbSem).map(Number).sort((a, b) => a - b);
  console.log('\nxb 操作码数:', xbOps.length, '范围:', Math.min(...xbOps), '-', Math.max(...xbOps));
  console.log('nx 操作码数:', sortedOps.length, '范围:', Math.min(...sortedOps), '-', Math.max(...sortedOps));
  const overlap = sortedOps.filter(op => xbOps.includes(op));
  console.log('交集操作码数:', overlap.length);

  // 关键：对比相同 opcode 的语义相似度（变量名不同，需规范化比较）
  console.log('\n=== 语义对比（前 10 个交集）===');
  overlap.slice(0, 10).forEach(op => {
    const nx = (handlers[op] || '').replace(/[_$][\w$]*/g, 'V').replace(/\s+/g, ' ').substring(0, 100);
    const xb = (xbSem[op] || '').replace(/[_$][\w$]*/g, 'V').replace(/\s+/g, ' ').substring(0, 100);
    console.log(`op${op}:\n  nx: ${nx}\n  xb: ${xb}`);
  });
} catch (e) {
  console.log('xb 对比失败:', e.message);
}
process.exit(0);
