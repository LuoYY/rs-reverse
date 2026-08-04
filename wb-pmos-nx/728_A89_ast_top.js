/**
 * 728_A89_ast_top.js
 * 用 acorn 解析 dynCode AST，找 IIFE 顶层可执行语句（启动代码）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');

(async () => {
  let acorn;
  try { acorn = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_glm/node_modules', 'acorn')); } catch (e) {}
  if (!acorn) {
    try { acorn = require('acorn'); } catch (e) {}
  }
  if (!acorn) {
    // 用 esprima 或简单方法：找 IIFE 体内的顶层语句
    console.log('无 acorn，用简单方法');
    const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
    // IIFE 体 = (function(_$l9,_$_s){ ... })($_ts.scj,$_ts.aebi)
    // 找最后一个 '})(' 之前的内容
    const end = code.lastIndexOf('})');
    const body = code.substring(code.indexOf('{') + 1, end);
    // 找顶层语句：用 Function 构造函数内部 AST 不可行，用分号分割但函数体内分号多
    // 简单：找所有 ';' 前不是 function 的顶层代码——用括号深度
    let depth = 0;
    const stmts = [];
    let cur = '', start = -1;
    let inStr = null;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (inStr) {
        cur += c;
        if (c === inStr && body[i - 1] !== '\\') inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; cur += c; continue; }
      cur += c;
      if (c === '{') depth++;
      else if (c === '}') depth--;
      if (c === ';' && depth === 0) {
        const s = cur.trim();
        if (s.length > 0 && !s.startsWith('function') && !s.startsWith('var ') && !s.startsWith('let ') && !s.startsWith('const ')) {
          stmts.push(s.substring(0, 150));
        }
        cur = '';
      }
    }
    if (cur.trim().length > 0) stmts.push(cur.trim().substring(0, 150));
    console.log('顶层语句数:', stmts.length);
    stmts.forEach((s, i) => console.log(`${i}: ${s}`));
    process.exit(0);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
