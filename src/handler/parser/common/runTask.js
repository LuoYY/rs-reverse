// 直接通过动态代码执行来运行任务
// 该方法并未完全还原，谨慎使用
const gv = require('@src/handler/globalVarible');
const monitor = require('@utils/monitor');
const logger = require('@utils/logger');
const custask = require('../task');
const error = require('@utils/error');
const parser = require('@babel/parser');

// ★ rebuiltCode 环境提取缓存：
//   1. IIFE 主体顶层的所有函数声明（跳过顶层 return/while 死循环）
//   2. 主 dispatcher（4 参数 + while 循环）while 前的 var 声明 + 初始化赋值（操作码环境：栈/寄存器初始化）
let __rebuiltFuncCache = null;
function getRebuiltFuncs(rebuilt, mainParams) {
  if (__rebuiltFuncCache && __rebuiltFuncCache.code === rebuilt) return __rebuiltFuncCache.defs;
  try {
    const ast = parser.parse(rebuilt, { sourceType: 'script', allowReturnOutsideFunction: true });
    const defs = [];
    let env = '';
    const expr = ast.program.body[0];
    if (expr && expr.type === 'ExpressionStatement' && expr.expression.type === 'CallExpression') {
      const body = expr.expression.callee.body.body;
      body.forEach(n => {
        if (n.type === 'FunctionDeclaration' && n.id && n.id.name) {
          defs.push(rebuilt.substring(n.start, n.end));
        }
      });
    }
    // 主 dispatcher：参数名匹配 codemap.params 且含 while 循环
    // → 提取 while 前的 var 声明 + 赋值（操作码环境初始化：栈/寄存器）
    const paramSet = Array.isArray(mainParams) && mainParams.length ? new Set(mainParams) : null;
    (function findMainDispatcher(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'FunctionDeclaration' && node.params && node.body && node.body.body) {
        const pNames = node.params.map(p => p.name);
        const match = paramSet ? pNames.length === paramSet.size && pNames.every(p => paramSet.has(p)) : false;
        if (match) {
          let hasWhile = false;
          (function chk(n2) {
            if (!n2 || typeof n2 !== 'object') return;
            if (n2.type === 'WhileStatement') hasWhile = true;
            for (const k of Object.keys(n2)) { const v = n2[k]; if (Array.isArray(v)) v.forEach(chk); else if (v && typeof v.type === 'string') chk(v); }
          })(node);
          if (hasWhile) {
            for (const stmt of node.body.body) {
              if (stmt.type === 'WhileStatement') break;
              if (stmt.type === 'VariableDeclaration' || stmt.type === 'ExpressionStatement') {
                env += rebuilt.substring(stmt.start, stmt.end) + '\n';
              }
            }
          }
        }
      }
      for (const k of Object.keys(node)) { const v = node[k]; if (Array.isArray(v)) v.forEach(findMainDispatcher); else if (v && typeof v.type === 'string') findMainDispatcher(v); }
    })(ast.program);
    const result = defs.join('\n') + '\n' + env;
    __rebuiltFuncCache = { code: rebuilt, defs: result };
    return result;
  } catch (e) {
    return null;
  }
}

function runTaskByUid(uid, ...params) {
  const tasks = gv.r2mka(uid);
  if (process.env.DEBUG_RUNTASK) console.log(`[runTaskByUid] ${uid} →`, tasks ? 'len=' + tasks.length : 'undefined', '类型:', typeof tasks);
  if (!tasks || tasks.length !== 1) throw new Error(`当前任务${uid}未找到或者不唯一，请检查！`);
  if (process.env.DEBUG_RUNTASK) {
    console.log(`[runTaskByUid] ${uid} 执行 task.key=${tasks[0].key} taskarr=${JSON.stringify(tasks[0].taskarr)}`);
    const cm2 = gv.config.codemap;
    const ta2 = tasks[0].taskarr || [];
    console.log(`[runTaskByUid] ${uid} taskarr 长度 ${ta2.length}，完整操作码:`);
    ta2.forEach((idx2, i) => {
      console.log(`  task[${i}]=${idx2}: ${typeof cm2[idx2] === 'string' ? cm2[idx2].substring(0, 200).replace(/\n/g, ' ') : '非字符串'}`);
    });
  }
  return runTask(tasks.pop(), ...params);
}

function runTask(task, args, allowTask) {
  if (typeof task === 'string') task = gv.r2mka(task);
  if (!task) throw new Error('任务未找到');
  logger.debug(`${task.key}执行开始!`);
  try {
    const global_res = new Proxy({}, {
      get(target, property, receiver) {
        // 由于每个版本下标都会变，在解析cd值生成8位偏移数的时候只用到了cp2数组，因此这里只返回cp2，需要注意！
        logger.debug(`global_res 获取下标： ${property}`);
        return gv.cp2;
      }
    })
    const loop_res = new Proxy([], {
      get(target, key, receiver) {
        const child = gv.r2mka().child_one;
        if (Number(key) < child.length) {
          const current = child[key];
          if (!key) return current;
          return (...params) => {
            if (custask[current.key]) {
              // 自定义任务
              return custask[current.key](...params);
            }
            if (allowTask && !allowTask[key]) {
              // 宽松模式：nx 等站点 cd 任务树 key 可能与 getTaskarr 解析不一致，
              // 改为 warn 继续执行（xj 站点已验证不受影响）
              logger.warn(`当前任务不在允许列表（宽松模式继续）: ${current.key}`);
            }
            return dynamicExec(current, 0, params, loop_res, global_res);
          }
        }
        if (gv.config.offsetConst[key]) return gv.config.offsetConst[key];
        if (task.uid === "U14124020") {
          const idx = parseInt(key);
          Object.assign(gv.config.offsetConst, { [idx]: 3, [idx + 1]: 51, [idx + 2]: 153 });
          return gv.config.offsetConst[key];
        }
        error(`loop_res取值未找到: ${key}`, { key });
      }
    })
    return dynamicExec(task, 0, args, loop_res, global_res);
  } catch (err) {
    logger.error(String(err));
    throw err;
  } finally {
    logger.debug(`${task.key}执行结束!`);
  }
}

function taskFactory(task, args) {
  return (...params) => {
    if (custask[task.key]) return custask[task.key](...params);
    return module.exports(task, params);
  }
}

function getParentSubTask(task, loopRes) {
  const subTask = [];
  if (!task) debugger;
  while (task.isReset === 0 && task.key !== '0-0') {
    subTask.push(['window', 'args', ...task.child_one.slice(2).map(it => taskFactory(it))]);
    task = task.parent;
  }
  return [loopRes, ...subTask.reverse()];
}


function dynamicExec(taskItem, start = 0, args = [], loop_res = {}, global_res = {}) {
  const codemap = gv.config.codemap;
  const { key, taskarr: task } = taskItem;
  args = monitor(args, `${key}_args`, { getLog: true, setLog: true });
  loop_res = monitor(loop_res, `${key}_loop_res`, { getLog: true, setLog: true });
  global_res = monitor(global_res, `${key}_global_res`, { getLog: true, setLog: true });
  logger.debug(`动态代码运行，任务列表：${key}, 起点：${start}，长度：${task.length}`);
  const data = [];
  const ret = [];
  ret[0] = args;
  ret[2] = [ 'window', args ];
  ret[3] = getParentSubTask(taskItem.parent, loop_res);
  const taskItemProxy = new Proxy({}, {
    get(target, property, receiver) {
      const idx = codemap.taskAttr.indexOf(property);
      if (idx === -1) debugger;
      const name = ['lens', 'isReset', 'taskarr', 'child_one', 'child_two'][idx];
      if (!name) debugger;
      return taskItem[name];
    }
  })
  const vars = [
    `${codemap.params[0]} = taskItemProxy`,
    `${codemap.params[1]} = start`,
    `${codemap.params[2]} = task.length`,
    `${codemap.params[3]} = ret`,
    // 任务工厂函数
    `${codemap.taskFactory} = taskFactory`,
    `${codemap.keyname} = gv.ts.cp[1]`,
    // 任务列表
    `${codemap.taskarr} = task`,
    // 数据数组
    `${codemap.dataKey} = data`,
    // 数据数组游标
    `${codemap.dataIdx} = 0`,
    `${codemap.ret0} = ret[0]`,
    `${codemap.ret1} = ret[1]`,
    `${codemap.ret2} = ret[2]`,
    `${codemap.ret3} = ret[3]`,
    // 全局资源
    `${codemap.globalRes} = global_res`,
    // 本地资源
    `${codemap.loopRes} = loop_res`,
    `${codemap.forcur} = start`, 
    `${codemap.formax} = task.length`,
    ...codemap.varible,
  ].join(', ');
  // 注入重建代码完整环境（nx 等站点任务代码引用 IIFE 闭包变量/函数）
  // 重建代码 = (function(A,B){ <主体> })(scj, aebi)，<主体> 顶层是函数声明（不能整体 eval——含顶层 return/while 死循环）
  // ★ 用 Babel 提取 <主体> 顶层的所有函数声明 eval 到当前作用域（跳过顶层 return/while）
  // ★ 每次 dynamicExec 调用都注入：函数声明绑定在调用作用域，一次性注入会导致后续调用缺函数
  // ★ 必须用 _getAttr：GlobalVarible 无 rebuiltCode getter，gv.rebuiltCode 恒为 undefined
  try {
    const rebuilt = gv._getAttr('rebuiltCode') || '';
    if (rebuilt && rebuilt.length > 1000) {
      const cm = gv.config.codemap;
      const funcs = getRebuiltFuncs(rebuilt, cm && cm.params);
      if (funcs && funcs.length > 0) {
        eval(funcs);
        if (process.env.DEBUG_INJECT) console.log(`[注入] 环境 ${funcs.length} 字符`);
      } else if (process.env.DEBUG_INJECT) {
        console.log(`[注入] 函数提取失败 rebuilt=${rebuilt.length}`);
      }
    }
  } catch (e) {
    logger.warn(`注入重建代码环境失败: ${e.message.substring(0, 80)}`);
  }
  eval(`var ${vars};${codemap.commonFunc}`)
  for (let t_cursor = start, idx = 0; t_cursor < task.length; t_cursor++) {
    idx ++;
    if (typeof codemap[task[t_cursor]] !== 'string') {
      logger.error(`codemap中下标${task[t_cursor]}不存在值!`)
    } else {
      logger.debug(`(${key}, ${idx}, ${task[t_cursor]})执行代码：${codemap[task[t_cursor]]}`);
      if (process.env.DEBUG_TASK) console.log(`[TASK ${key}#${idx}] code: ${(codemap[task[t_cursor]] || '').substring(0, 300)}`);
      eval(`${codemap.forcur}=t_cursor`);
      codemap[task[t_cursor]].split(';').map(it => it.trim()).forEach(c => {
        try {
          if (process.env.DEBUG_TASK) console.log(`[TASK exec] ${c.substring(0, 200)}`);
          eval(c);
        } catch(err) {
          logger.error(`代码: ${c} 执行失败，当前任务：${key}`)
          debugger;
          throw err;
        }
      })
      eval(`t_cursor=${codemap.forcur}`);
    }
  }
  return ret[5];
}

module.exports = { runTask, runTaskByUid }
