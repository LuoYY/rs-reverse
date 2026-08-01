const logger = require('./logger');
const fs = require('fs');
const parser = require('@babel/parser');
const ifConditional2switch = require('sdenv-extract/src/plugins/ifConditional2switch');

// ★ Babel AST 提取函数定义（可靠，替代手写括号配对——正则字面量误判会导致截断）
let __babelCode = null;
let __babelFuncMap = null;
function buildFuncMap(code) {
  try {
    const ast = parser.parse(code, { sourceType: 'script', allowReturnOutsideFunction: true });
    const map = {};
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'FunctionDeclaration' && node.id && node.id.name) {
        map[node.id.name] = code.substring(node.start, node.end);
      }
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v.type === 'string') walk(v);
      }
    })(ast.program);
    return map;
  } catch (e) {
    return null;
  }
}

// 判断 / 是否为正则字面量开始（启发式：前字符非字母数字/下划线/右括号 → 正则）
function isRegexStart(code, i) {
  const prev = code[i - 1];
  if (prev === undefined) return true;
  if (/[0-9a-zA-Z_$)\]]/.test(prev)) return false;
  return true;
}
// 跳过正则字面量（/.../[flags]），返回结束位置
function skipRegex(code, i) {
  let j = i + 1, inCls = false;
  while (j < code.length) {
    if (code[j] === '\\') { j += 2; continue; }
    if (code[j] === '[') inCls = true;
    else if (code[j] === ']') inCls = false;
    else if (code[j] === '/' && !inCls) { j++; break; }
    j++;
  }
  return j;
}

// 提取代码中指定函数名的完整定义（Babel 优先，回退手写括号配对）
function extractFnDef(code, name) {
  if (code !== __babelCode) {
    __babelCode = code;
    __babelFuncMap = buildFuncMap(code);
  }
  if (__babelFuncMap && __babelFuncMap[name]) return __babelFuncMap[name];
  return extractFnDefManual(code, name);
}

// 手写括号配对（Babel 解析失败时的回退）
function extractFnDefManual(code, name) {
  const start = code.indexOf('function ' + name);
  if (start < 0) return null;
  let i = code.indexOf('(', start);
  if (i < 0) return null;
  let depth = 0, inStr = null;
  // 1. 跳过参数列表
  for (; i < code.length; i++) {
    const ch = code[i];
    if (inStr) { if (ch === inStr && code[i - 1] !== '\\') inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '/' && isRegexStart(code, i)) { i = skipRegex(code, i) - 1; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) { i++; break; } }
  }
  // 2. 找函数体 {
  for (; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') { depth = 1; i++; break; }
    if (ch !== ' ' && ch !== '\n' && ch !== '\t' && ch !== '\r') { i--; break; }
  }
  // 3. 配对到 }
  for (; i < code.length && depth > 0; i++) {
    const ch = code[i];
    if (inStr) { if (ch === inStr && code[i - 1] !== '\\') inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '/' && isRegexStart(code, i)) { i = skipRegex(code, i) - 1; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return code.substring(start, i + 1); }
  }
  return null;
}

module.exports = function getCodemap(jscode) {
  const result = ifConditional2switch(null, { input: jscode });
  const content = result.filter(it => it.path.indexOf('main_codemap') === 0).pop()?.content;
  if (!content) throw new Error('codemap获取失败，请检查！');
  const cm = JSON.parse(content);
  // 补充 varible：收集所有任务代码 + commonFunc 引用的 _$xxx 标识符
  try {
    if (Array.isArray(cm.varible)) {
      const existing = new Set([...cm.varible, ...(cm.params || [])]);
      const allCode = Object.keys(cm)
        .filter(k => typeof cm[k] === 'string' && k !== 'commonFunc')
        .map(k => cm[k]).join(';') + ';' + (cm.commonFunc || '');
      const refs = [...new Set([...allCode.matchAll(/_\$[a-zA-Z0-9_\$]{1,5}/g)].map(m => m[0]))];
      const newVars = refs.filter(v => !existing.has(v));
      if (newVars.length) {
        cm.varible = [...cm.varible, ...newVars];
        logger.debug(`varible 补充 ${newVars.length} 个变量 (总数 ${cm.varible.length})`);
      }
    }
  } catch (e) {
    logger.warn(`补充 varible 失败: ${e.message}`);
  }
  // 注入任务代码引用的函数定义（递归：函数引用的函数也注入）
  try {
    if (cm.commonFunc) {
      // 收集任务代码中调用的函数名
      const taskCode = Object.keys(cm)
        .filter(k => typeof cm[k] === 'string' && k !== 'commonFunc')
        .map(k => cm[k]).join(';');
      const queue = [...new Set([...taskCode.matchAll(/_\$[a-zA-Z0-9_\$]{1,5}\s*\(/g)].map(m => m[0].replace(/\s*\(/, '')))];
      const injected = new Set();
      const defs = [];
      while (queue.length) {
        const fnName = queue.shift();
        if (injected.has(fnName)) continue;
        const def = extractFnDef(jscode, fnName);
        if (def) {
          injected.add(fnName);
          defs.push(def);
          // 收集定义引用的函数
          for (const m of def.matchAll(/_\$[a-zA-Z0-9_\$]{1,5}\s*\(/g)) {
            const inner = m[0].replace(/\s*\(/, '');
            if (!injected.has(inner)) queue.push(inner);
          }
        } else {
          injected.add(fnName); // 避免重复尝试
        }
      }
      // ★ 逐个语法验证注入的函数定义：extractFnDef 对复杂代码可能截断，
      //   坏 def 会导致 commonFunc eval 报 Illegal return / 括号不平衡
      const okDefs = [];
      for (const d of defs) {
        try {
          new Function(d);
          okDefs.push(d);
        } catch (e) {
          if (process.env.DEBUG_CODEMAP) {
            console.log(`[DEBUG_CODEMAP] 坏 def 跳过: len=${d.length} 头=${d.substring(0, 60).replace(/\n/g, ' ')} err=${e.message.substring(0, 40)}`);
            try { fs.writeFileSync('/tmp/nx_bad_def.js', d); } catch (e2) {}
          }
        }
      }
      if (okDefs.length) {
        cm.commonFunc += '\n' + okDefs.join('\n');
        logger.debug(`已注入 ${okDefs.length}/${defs.length} 个函数到 codemap.commonFunc`);
      } else if (process.env.DEBUG_CODEMAP) {
        console.log('[DEBUG_CODEMAP] 全部 def 均为坏函数，不注入');
      }
      if (process.env.DEBUG_CODEMAP) {
        console.log(`[DEBUG_CODEMAP] queue=${queue.length} defs=${defs.length} okDefs=${okDefs.length}`);
        console.log(`[DEBUG_CODEMAP] commonFunc: ${cm.commonFunc.length}`);
        const cf2 = cm.commonFunc;
        console.log(`[DEBUG_CODEMAP] 括号 {=${(cf2.match(/\{/g)||[]).length} }=${(cf2.match(/\}/g)||[]).length}`);
      }
      // ★ 补充 varible（必须放在函数注入之后——收集注入函数体引用的变量）
      try {
        if (Array.isArray(cm.varible)) {
          const existing = new Set([...cm.varible, ...(cm.params || [])]);
          const allCode = Object.keys(cm)
            .filter(k => typeof cm[k] === 'string')
            .map(k => cm[k]).join(';');
          const refs = [...new Set([...allCode.matchAll(/_\$[a-zA-Z0-9_\$]{1,5}/g)].map(m => m[0]))];
          const newVars = refs.filter(v => !existing.has(v));
          if (newVars.length) {
            cm.varible = [...cm.varible, ...newVars];
            logger.debug(`varible 补充(注入后) ${newVars.length} 个 (总数 ${cm.varible.length})`);
          }
        }
      } catch (e) {
        logger.warn(`varible 补充失败: ${e.message}`);
      }
    }
  } catch (e) {
    logger.warn(`注入函数失败: ${e.message}`);
  }
  return cm;
}
