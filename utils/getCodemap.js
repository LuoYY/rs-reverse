const logger = require('./logger');
const ifConditional2switch = require('sdenv-extract/src/plugins/ifConditional2switch');

// 提取代码中指定函数名的完整定义（跳过参数列表，函数体括号配对）
function extractFnDef(code, name) {
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
      if (defs.length) {
        cm.commonFunc += '\n' + defs.join('\n');
        logger.debug(`已注入 ${defs.length} 个函数到 codemap.commonFunc`);
      }
    }
  } catch (e) {
    logger.warn(`注入函数失败: ${e.message}`);
  }
  return cm;
}
