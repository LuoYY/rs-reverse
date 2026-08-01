/**
 * 207_if_tree.js
 *
 * 解析 main dispatcher 的 while if 树：提取操作码分支 + 代码
 * 用 xj 语义映射验证 nx 操作码结构 → 找 basestr/加密相关
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

(async () => {
  const dyn = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');
  // 主 dispatcher 的 while（168110）
  const wStart = 168110;
  // 提取 while 体（括号配对）
  let depth = 0, i = wStart;
  while (i < dyn.length) {
    if (dyn[i] === '{') depth++;
    else if (dyn[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  const whileCode = dyn.substring(wStart, i + 1);
  console.log('while 体长度:', whileCode.length);

  // 提取 if(_$k7===N){...} 分支（用正则，简单提取）
  const branches = [];
  const re = /if\(_\$k7===(=?\d+)\)\{/g;
  let m;
  while ((m = re.exec(whileCode)) !== null) {
    // 提取分支代码（花括号配对）
    let d = 1, j = m.index + m[0].length - 1;
    // 找 { 的位置
    const braceIdx = whileCode.indexOf('{', m.index);
    d = 1;
    for (j = braceIdx + 1; j < whileCode.length; j++) {
      if (whileCode[j] === '"' || whileCode[j] === "'" || whileCode[j] === '`') { const q = whileCode[j]; j++; while (j < whileCode.length && whileCode[j] !== q) { if (whileCode[j] === '\\') j++; j++; } }
      else if (whileCode[j] === '{') d++;
      else if (whileCode[j] === '}') { d--; if (d === 0) break; }
    }
    const code = whileCode.substring(braceIdx + 1, j);
    branches.push({ op: +m[1], code: code.substring(0, 90) });
    if (branches.length >= 80) break;
  }
  console.log('操作码分支数:', branches.length);
  // 用 xj 语义映射
  const sem = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'wb-dsv4flash/opcode_semantics_v3.json')));
  branches.forEach(b => {
    const xj = sem[String(b.op)];
    console.log(`op${b.op}: ${b.code.replace(/\n/g, ' ')}${xj ? '  ⟵xj:' + xj.substring(0, 40) : ''}`);
  });
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
