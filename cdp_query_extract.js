/**
 * CDP 断点提取 RS query参数生成过程（v4）
 *
 * v3 教训：
 * - addInitScript 运行在 isolated world，RS 在 main world
 * - 我们的 prototype hooks 对 RS 不可见
 * - 38 scripts vs v1 的 131 scripts → 页面没完全加载
 *
 * v4 核心策略：
 * 1. 用 CDP Page.addScriptToEvaluateOnNewDocument（main world 注入）
 *    这与 addInitScript 不同——它在 main world 执行，RS 能看到我们的 hooks
 * 2. 我们的 open/send wrapper 在 RS 之前安装
 *    RS 随后 wrap 我们的 wrapped 版本
 *    当业务代码调用 open 时：业务 → RS hook → 我们的 open → 原始 open
 *    我们能在 RS hook 之后看到含 query 的 URL
 * 3. 同时用 CDP Debugger 设条件断点
 * 4. 断点命中后检查 $_mb 状态数组和 trampoline 返回值
 *
 * 用法：
 *   source ~/.nvm/nvm.sh && nvm exec 22 node cdp_query_extract.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const fs = require('fs');
const path = require('path');
const { chromium } = require('patchright');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT_DIR = path.join(__dirname, 'output', 'capture-20080');
const PARAM_NAME = 'r20SZOQm';

function log(...args) { console.log('[cdp]', ...args); }
function safeStr(v, max = 200) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return v.length > max ? v.substring(0, max) + '...' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v).substring(0, max); } catch { return String(v).substring(0, max); }
}

// ═══════════════════════════════════════════════════════════════
// MAIN WORLD injection script
// This runs BEFORE RS in the main world via Page.addScriptToEvaluateOnNewDocument
// ═══════════════════════════════════════════════════════════════
const INIT_SCRIPT = `
(function() {
  // ====== 保存原始 open/send ======
  var _origOpen = XMLHttpRequest.prototype.open;
  var _origSend = XMLHttpRequest.prototype.send;

  window.__rsQueryData = {
    openCalls: [],
    sendCalls: [],
    queryValues: [],
    mbSnapshots: [],
  };

  // ====== open wrapper ======
  // RS 会 wrap 我们的 wrapped open
  // 调用链：业务代码 → RS hook → 我们的 open → 原始 open
  // 所以当我们的 open 被调用时，RS 已经修改了 URL（追加了 query）
  XMLHttpRequest.prototype.open = function(method, url) {
    var urlStr = String(url);
    var hasQuery = urlStr.indexOf('${PARAM_NAME}') >= 0;

    var entry = {
      method: String(method),
      url: urlStr.substring(0, 400),
      hasQuery: hasQuery,
      timestamp: Date.now(),
    };

    if (hasQuery) {
      var match = urlStr.match(/${PARAM_NAME}=([^&]+)/);
      if (match) {
        entry.queryValue = match[1];
        window.__rsQueryData.queryValues.push({
          value: match[1],
          method: String(method),
          urlPath: new URL(urlStr, location.origin).pathname,
          timestamp: Date.now(),
        });
      }
    }

    // 检查 XHR 实例上 RS 设置的属性
    try {
      var ownProps = Object.getOwnPropertyNames(this);
      var rsProps = {};
      for (var i = 0; i < ownProps.length; i++) {
        var k = ownProps[i];
        if (k.charAt(0) === '_' && k.charAt(1) === '$') {
          try {
            var v = this[k];
            if (typeof v === 'function') rsProps[k] = '[fn:' + (v.name || 'anon') + ']';
            else if (typeof v === 'boolean') rsProps[k] = v;
            else if (typeof v === 'string') rsProps[k] = v.substring(0, 100);
            else if (typeof v === 'number') rsProps[k] = v;
            else if (Array.isArray(v)) rsProps[k] = '[arr:' + v.length + ']';
          } catch(e) {}
        }
      }
      entry.rsProps = rsProps;
    } catch(e) {}

    // 捕获调用栈
    try { entry.stack = new Error().stack; } catch(e) {}

    window.__rsQueryData.openCalls.push(entry);
    if (window.__rsQueryData.openCalls.length > 100) window.__rsQueryData.openCalls.shift();

    return _origOpen.apply(this, arguments);
  };

  // ====== send wrapper ======
  XMLHttpRequest.prototype.send = function(body) {
    var entry = {
      body: body ? String(body).substring(0, 200) : null,
      timestamp: Date.now(),
    };

    // 检查实例上 RS 设置的 trampoline 和 flag
    try {
      var ownProps = Object.getOwnPropertyNames(this);
      for (var i = 0; i < ownProps.length; i++) {
        var k = ownProps[i];
        if (k.charAt(0) === '_' && k.charAt(1) === '$') {
          try {
            var v = this[k];
            if (typeof v === 'function') {
              entry.trampoline = k;
              entry.trampolineSrc = v.toString().substring(0, 300);
            } else if (typeof v === 'boolean') {
              entry[k] = v;
            }
          } catch(e) {}
        }
      }
    } catch(e) {}

    window.__rsQueryData.sendCalls.push(entry);
    if (window.__rsQueryData.sendCalls.length > 100) window.__rsQueryData.sendCalls.shift();

    return _origSend.apply(this, arguments);
  };

  // ====== 监控 $_ts ======
  var _tsValue = undefined;
  try {
    Object.defineProperty(window, '$_ts', {
      get: function() { return _tsValue; },
      set: function(v) {
        _tsValue = v;
        if (v && typeof v === 'object') {
          try {
            window.__rsQueryData.tsKeys = Object.keys(v);
            if (v.cp) {
              window.__rsQueryData.tsCp = { length: v.cp.length };
            }
          } catch(e) {}
        }
      },
      configurable: true,
    });
  } catch(e) {}

  console.log('[init] RS query extraction hooks installed (main world, pre-RS)');
})();
`;

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  log('启动 Patchright...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();

  // ─── 网络层捕获 ───
  const networkQueries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes(PARAM_NAME + '=')) {
      const m = url.match(new RegExp(PARAM_NAME + '=([^&]+)'));
      if (m) {
        networkQueries.push({
          method: req.method(),
          path: new URL(url).pathname,
          query: m[1],
          fullUrl: url.substring(0, 300),
          body: req.postData() || '',
          timestamp: Date.now(),
        });
        log('🌐 捕获 query:', req.method(), new URL(url).pathname, 'len=' + m[1].length);
      }
    }
  });

  // ─── CDP session ───
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');
  await client.send('Runtime.enable');
  await client.send('Page.enable');

  // ═══════════════════════════════════════════════════════════════
  // 关键：用 Page.addScriptToEvaluateOnNewDocument 在 main world 注入
  // 这与 Playwright 的 addInitScript 不同
  // addInitScript 在 isolated world 执行
  // Page.addScriptToEvaluateOnNewDocument 在 main world 执行
  // ═══════════════════════════════════════════════════════════════
  log('注入 main world init script（Page.addScriptToEvaluateOnNewDocument）...');
  const initResult = await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: INIT_SCRIPT,
  });
  log('Init script identifier:', initResult.identifier);

  // ─── 收集 scriptParsed ───
  const scripts = new Map();
  let dynScriptIds = [];

  client.on('Debugger.scriptParsed', (event) => {
    scripts.set(event.scriptId, {
      url: event.url || '',
      length: event.length || 0,
      hash: event.hash || '',
    });
    if (!event.url && event.length > 50000) {
      dynScriptIds.push(event.scriptId);
    }
  });

  // ─── 断点命中处理 ───
  const breakpointHits = [];
  let hitCount = 0;

  client.on('Debugger.paused', async (event) => {
    hitCount++;
    const hit = { reason: event.reason, callFrames: [], timestamp: Date.now() };
    log(`\n🔴 断点命中 #${hitCount} (reason: ${event.reason}, ${event.callFrames.length} frames)`);

    for (let i = 0; i < Math.min(event.callFrames.length, 25); i++) {
      const frame = event.callFrames[i];
      const scriptInfo = scripts.get(frame.scriptId);
      const isDynCode = scriptInfo && (!scriptInfo.url || scriptInfo.length > 50000);
      const isRSFrame = isDynCode && frame.functionName !== '';

      const frameInfo = {
        index: i,
        functionName: frame.functionName || '(anonymous)',
        scriptId: frame.scriptId,
        scriptLen: scriptInfo?.length || 0,
        line: frame.lineNumber,
        column: frame.columnNumber,
        isRSFrame,
      };

      if (i < 5 || isRSFrame) {
        // 获取局部变量
        if (frame.scopeChain) {
          const locals = {};
          for (const scope of frame.scopeChain) {
            if (scope.type === 'local' && scope.object.objectId) {
              try {
                const props = await client.send('Runtime.getProperties', {
                  objectId: scope.object.objectId,
                  ownProperties: true,
                  generatePreview: true,
                });
                for (const prop of props.result) {
                  const val = prop.value;
                  if (!val) continue;
                  let valStr = '';
                  if (val.type === 'string') {
                    valStr = (val.value || '').substring(0, 200);
                    if (valStr.includes('${PARAM_NAME}') || (valStr.length > 100 && valStr[0] === '0' && /^[A-Za-z0-9._]+$/.test(valStr))) {
                      valStr = '★QUERY★ ' + valStr;
                    }
                  } else if (val.type === 'number') valStr = String(val.value);
                  else if (val.type === 'boolean') valStr = String(val.value);
                  else if (val.type === 'function') valStr = '[fn:' + (val.description || '').substring(0, 60) + ']';
                  else if (val.type === 'object') {
                    if (val.subtype === 'array') valStr = '[arr:' + (val.preview?.properties || '').substring(0, 100) + ']';
                    else if (val.subtype === 'null') valStr = 'null';
                    else valStr = '[obj:' + (val.preview?.description || '') + ']';
                  }
                  else if (val.type === 'undefined') valStr = 'undef';
                  else valStr = val.description || val.type;
                  locals[prop.name] = { type: val.type, value: valStr };
                }
              } catch (e) {}
            }
          }
          frameInfo.locals = locals;
        }

        // 检查 this
        try {
          const thisResult = await client.send('Debugger.evaluateOnCallFrame', {
            callFrameId: frame.callFrameId,
            expression: `(function(){
              try {
                if (!this || typeof this !== 'object') return JSON.stringify({type: typeof this, value: String(this).substring(0,50)});
                var result = {};
                var keys = Object.getOwnPropertyNames(this);
                for (var i = 0; i < keys.length; i++) {
                  var k = keys[i];
                  try {
                    var v = this[k];
                    if (typeof v === 'string') {
                      result[k] = v.substring(0, 200);
                      if (v.indexOf('${PARAM_NAME}') >= 0) result[k] = '★QUERY★ ' + result[k];
                    }
                    else if (typeof v === 'function') result[k] = '[fn]';
                    else if (typeof v === 'boolean') result[k] = v;
                    else if (typeof v === 'number') result[k] = v;
                  } catch(e) {}
                }
                result._ctorName = this.constructor ? this.constructor.name : '?';
                return JSON.stringify(result);
              } catch(e) { return '{"error":"' + e.message.substring(0,80) + '"}'; }
            }).call(this)`,
            returnByValue: true,
          });
          frameInfo.thisValue = thisResult.result?.value;
        } catch(e) {}

        // 检查 arguments
        try {
          const argsResult = await client.send('Debugger.evaluateOnCallFrame', {
            callFrameId: frame.callFrameId,
            expression: `(function(){
              try {
                var args = [];
                for (var i = 0; i < arguments.length; i++) {
                  var a = arguments[i];
                  if (typeof a === 'string') {
                    var entry = {type:'string', value: a.substring(0, 200)};
                    if (a.indexOf('${PARAM_NAME}') >= 0 || (a.length > 100 && a[0] === '0' && /^[A-Za-z0-9._]+$/.test(a))) {
                      entry.queryCandidate = true;
                    }
                    args.push(entry);
                  }
                  else if (typeof a === 'number') args.push({type:'number', value: a});
                  else if (typeof a === 'boolean') args.push({type:'boolean', value: a});
                  else if (a === null) args.push({type:'null'});
                  else if (a === undefined) args.push({type:'undefined'});
                  else if (Array.isArray(a)) {
                    args.push({type:'array', length: a.length, head: a.slice(0, 16).join(',')});
                  }
                  else if (typeof a === 'object') {
                    var keys = Object.getOwnPropertyNames(a).slice(0, 15);
                    var sample = {};
                    for (var j = 0; j < keys.length; j++) { try { sample[keys[j]] = String(a[keys[j]]).substring(0, 60); } catch(e){} }
                    args.push({type:'object', keys: keys, sample: sample});
                  }
                  else args.push({type: typeof a});
                }
                return JSON.stringify(args);
              } catch(e) { return '[]'; }
            })()`,
            returnByValue: true,
          });
          frameInfo.arguments = argsResult.result?.value;
        } catch(e) {}

        // ★ 在 RS 帧中搜索 $_mb 和状态数组
        if (isRSFrame) {
          try {
            const mbResult = await client.send('Debugger.evaluateOnCallFrame', {
              callFrameId: frame.callFrameId,
              expression: `(function(){
                try {
                  var result = {};
                  // 检查 window 上所有 _$ 开头的变量
                  var dollarVars = {};
                  var wKeys = Object.getOwnPropertyNames(this);
                  for (var i = 0; i < wKeys.length; i++) {
                    var k = wKeys[i];
                    if (k.charAt(0) === '_' && k.charAt(1) === '$') {
                      try {
                        var v = this[k];
                        if (Array.isArray(v) && v.length < 500) {
                          dollarVars[k] = { type: 'array', length: v.length, sample: v.slice(0, 20) };
                        } else if (typeof v === 'object' && v !== null) {
                          dollarVars[k] = { type: 'object', keys: Object.keys(v).slice(0, 10) };
                        } else if (typeof v === 'function') {
                          dollarVars[k] = { type: 'function' };
                        } else {
                          dollarVars[k] = { type: typeof v, value: String(v).substring(0, 50) };
                        }
                      } catch(e) {}
                    }
                  }
                  result.dollarVars = dollarVars;
                  return JSON.stringify(result);
                } catch(e) { return '{"error":"' + e.message.substring(0,80) + '"}'; }
              }).call(this)`,
              returnByValue: true,
            });
            frameInfo.mbState = mbResult.result?.value;
          } catch(e) {}
        }
      }

      hit.callFrames.push(frameInfo);

      // 打印
      const rs = isRSFrame ? ' ★RS' : '';
      log(`  [${i}] ${frameInfo.functionName} (${frameInfo.scriptLen > 50000 ? 'eval:' + frame.scriptId : scriptInfo?.url || ''}, ${frameInfo.scriptLen}B) L${frame.lineNumber}${rs}`);
      if (frameInfo.thisValue && frameInfo.thisValue !== '{}') {
        log(`      this: ${safeStr(frameInfo.thisValue, 200)}`);
      }
      if (frameInfo.arguments && frameInfo.arguments !== '[]') {
        log(`      args: ${safeStr(frameInfo.arguments, 200)}`);
      }
      if (frameInfo.locals) {
        const localKeys = Object.keys(frameInfo.locals);
        if (localKeys.length > 0) {
          const localStrs = localKeys.slice(0, 12).map(k => {
            const l = frameInfo.locals[k];
            return `${k}=${safeStr(l.value, 50)}`;
          });
          log(`      locals(${localKeys.length}): ${localStrs.join(', ')}`);
        }
      }
      if (frameInfo.mbState) {
        log(`      mbState: ${safeStr(frameInfo.mbState, 250)}`);
      }
    }

    breakpointHits.push(hit);
    await client.send('Debugger.resume');
  });

  // ═══════════════════════════════════════════════════════════════
  // 首次加载
  // ═══════════════════════════════════════════════════════════════
  log('\n=== 首次加载 ===');
  try {
    await page.goto(TARGET, { waitUntil: 'load', timeout: 45000 });
  } catch (e) {
    log('导航异常(可忽略):', e.message?.substring(0, 80));
  }

  // 等待 RS cookie
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1000);
    const cs = await context.cookies();
    if (cs.some(c => c.name.endsWith('P'))) {
      log(`P cookie 已生成 (${i + 1}s)`);
      break;
    }
  }
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch (e) {}
  await page.waitForTimeout(2000);

  log(`脚本统计: ${scripts.size} 个脚本`);
  log(`动态代码 IDs: ${dynScriptIds.join(', ')}`);

  // 检查 init script 是否生效
  const initCheck = await client.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      hasRsQueryData: typeof window.__rsQueryData !== 'undefined',
      openCalls: window.__rsQueryData ? window.__rsQueryData.openCalls.length : -1,
      openIsNative: XMLHttpRequest.prototype.open.toString().includes('[native code]'),
      openStr: XMLHttpRequest.prototype.open.toString().substring(0, 100),
    })`,
    returnByValue: true,
  });
  log('Init script 状态:', initCheck.result?.value);

  // ═══════════════════════════════════════════════════════════════
  // 设置 CDP 断点（在 reload 前）
  // ═══════════════════════════════════════════════════════════════
  log('\n=== 设置 CDP 断点 ===');

  // 获取 XHR.open objectId
  const openObj = await client.send('Runtime.evaluate', {
    expression: 'XMLHttpRequest.prototype.open',
  });
  log('XHR.open objectId:', openObj.result?.objectId?.substring(0, 40));

  let bpId = null;
  if (openObj.result?.objectId) {
    try {
      // 条件断点：只在 URL 包含 query 参数时暂停
      const bp = await client.send('Debugger.setBreakpointOnFunctionCall', {
        objectId: openObj.result.objectId,
        condition: `(function(){
          try {
            var url = arguments[1] || (arguments[0] && arguments[0].url) || '';
            return String(url).indexOf('${PARAM_NAME}') >= 0;
          } catch(e) { return false; }
        })()`,
      });
      bpId = bp.breakpointId;
      log('✅ 条件断点已设置:', bpId);
    } catch(e) {
      log('条件断点失败:', e.message);
      // 尝试无条件断点
      try {
        const bp2 = await client.send('Debugger.setBreakpointOnFunctionCall', {
          objectId: openObj.result.objectId,
        });
        bpId = bp2.breakpointId;
        log('✅ 无条件断点已设置:', bpId);
      } catch(e2) {
        log('无条件断点也失败:', e2.message);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Reload
  // ═══════════════════════════════════════════════════════════════
  networkQueries.length = 0;
  log('\n=== Reload 触发业务 API ===');
  try {
    await page.reload({ waitUntil: 'load', timeout: 60000 });
  } catch (e) {
    log('Reload 异常(可能因断点暂停):', e.message?.substring(0, 80));
  }

  // 等待 RS 验证
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const cs = await context.cookies();
    const pCookie = cs.find(c => c.name.endsWith('P'));
    if (pCookie && pCookie.value.length > 400) {
      log(`P cookie 已更新 (${i + 1}s)`);
      break;
    }
  }

  // 等待 SPA API 调用
  await page.waitForTimeout(12000);

  // 移除断点
  if (bpId) {
    try { await client.send('Debugger.removeBreakpoint', { breakpointId: bpId }); } catch(e) {}
  }

  // ═══════════════════════════════════════════════════════════════
  // 收集结果
  // ═══════════════════════════════════════════════════════════════
  const hookDataResult = await client.send('Runtime.evaluate', {
    expression: `JSON.stringify(window.__rsQueryData || {})`,
    returnByValue: true,
  });
  const hookData = JSON.parse(hookDataResult.result?.value || '{}');

  log(`\n=== Hook 数据 ===`);
  log(`  XHR.open 调用: ${hookData.openCalls?.length || 0}`);
  log(`  XHR.send 调用: ${hookData.sendCalls?.length || 0}`);
  log(`  query 值: ${hookData.queryValues?.length || 0}`);
  log(`  $_ts keys: ${JSON.stringify(hookData.tsKeys || [])}`);

  // 打印 open 调用
  if (hookData.openCalls?.length > 0) {
    log('\n=== XHR.open 调用详情 ===');
    hookData.openCalls.forEach((c, i) => {
      log(`  [${i}] ${c.method} hasQuery=${c.hasQuery} ${c.url.substring(0, 100)}`);
      if (c.queryValue) log(`      🎯 QUERY: ${c.queryValue}`);
      if (c.rsProps && Object.keys(c.rsProps).length > 0) {
        log(`      RS props: ${JSON.stringify(c.rsProps)}`);
      }
      if (c.stack) log(`      stack: ${safeStr(c.stack, 300)}`);
    });
  }

  // 打印 send 调用
  if (hookData.sendCalls?.length > 0) {
    log('\n=== XHR.send 调用详情 ===');
    hookData.sendCalls.slice(0, 10).forEach((c, i) => {
      log(`  [${i}] trampoline=${c.trampoline || 'N/A'} ${JSON.stringify(Object.keys(c).filter(k=>k.startsWith('_$')).map(k=>k+'='+c[k]))}`);
      if (c.trampolineSrc) log(`      trampoline src: ${safeStr(c.trampolineSrc, 200)}`);
    });
  }

  // 打印 query 值
  if (hookData.queryValues?.length > 0) {
    log('\n=== ★★★ 捕获到的 query 值 ===');
    hookData.queryValues.forEach((q, i) => {
      log(`  [${i}] ${q.method} ${q.urlPath}: ${q.value}`);
    });
  }

  // 打印断点命中
  if (breakpointHits.length > 0) {
    log('\n=== ★★★ CDP 断点命中 ===');
    breakpointHits.forEach((hit, i) => {
      log(`\n  命中 #${i + 1} (${hit.callFrames.length} frames):`);
      hit.callFrames.forEach(f => {
        log(`    [${f.index}] ${f.functionName} L${f.line} ${f.isRSFrame ? '★RS' : ''}`);
        if (f.thisValue) log(`        this: ${safeStr(f.thisValue, 150)}`);
        if (f.arguments) log(`        args: ${safeStr(f.arguments, 200)}`);
        if (f.locals) {
          const localStrs = Object.entries(f.locals).slice(0, 8).map(([k, v]) => `${k}=${safeStr(v.value, 50)}`);
          if (localStrs.length > 0) log(`        locals: ${localStrs.join(', ')}`);
        }
        if (f.mbState) log(`        mbState: ${safeStr(f.mbState, 250)}`);
      });
    });
  }

  // ─── 收集 cookies ───
  const cookies = await context.cookies();

  // ─── 输出完整结果 ───
  const output = {
    timestamp: new Date().toISOString(),
    target: TARGET,
    networkQueries,
    breakpointHits,
    hookData,
    cookies: cookies.map(c => ({ name: c.name, value: c.value })),
    scripts: Array.from(scripts.entries()).map(([id, s]) => ({ id, ...s })).filter(s => !s.url || s.length > 50000),
  };

  const outputFile = path.join(OUT_DIR, 'cdp-query-extract-v4-result.json');
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  log(`\n=== 结果已保存到 ${outputFile} ===`);

  log(`\n=== 汇总 ===`);
  log(`  网络层 query: ${networkQueries.length}`);
  log(`  断点命中: ${breakpointHits.length}`);
  log(`  open hook 捕获: ${hookData.openCalls?.length || 0}`);
  log(`  query 值捕获: ${hookData.queryValues?.length || 0}`);
  log(`  send hook 捕获: ${hookData.sendCalls?.length || 0}`);

  if (networkQueries.length > 0) {
    log('\n=== 网络层捕获的 query ===');
    networkQueries.forEach((q, i) => {
      log(`  [${i}] ${q.method} ${q.path}: ${q.query.substring(0, 60)}...`);
    });
  }

  await browser.close();
  log('\n完成');
  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message, e.stack);
  process.exit(1);
});
