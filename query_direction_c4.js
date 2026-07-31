/**
 * query_direction_c4.js — CDP 断点在 RS _$h4 函数
 *
 * 发现：所有 query 请求由 RS 函数 _$h4 发起（at :2:19686）
 * _$h4 是 RS 动态代码中的 XHR send wrapper
 * 
 * 策略：
 * 1. 用 CDP 在脚本中搜索 _$h4 定义
 * 2. 在 _$h4 入口设断点
 * 3. 当业务代码触发 XHR 时，断点命中
 * 4. 检查参数和局部变量，找到 query 生成过程
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== CDP 断点在 RS _$h4 ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');
  await client.send('Runtime.enable');

  // 收集脚本
  const scripts = {};
  client.on('Debugger.scriptParsed', (e) => { scripts[e.scriptId] = { url: e.url || '', hash: e.hash || '' }; });

  // 捕获 query
  const capturedQueries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) capturedQueries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  console.log('加载页面...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 5000));

  console.log(`Scripts: ${Object.keys(scripts).length}`);

  // 搜索 _$h4 在所有脚本中
  console.log('\n搜索 _$h4 定义...');
  let targetScriptId = null;
  let targetLine = null;

  for (const [scriptId, info] of Object.entries(scripts)) {
    if (info.url) continue; // 只搜索 eval 脚本
    try {
      // 搜索 function _$h4
      const result = await client.send('Debugger.searchInContent', {
        scriptId,
        query: 'function _$h4',
        caseSensitive: false,
      });
      if (result.result && result.result.length > 0) {
        console.log(`  Found in script ${scriptId}: ${result.result.length} matches`);
        result.result.forEach(r => {
          console.log(`    Line ${r.lineNumber}: ${r.lineContent?.substring(0, 100)}`);
        });
        targetScriptId = scriptId;
        targetLine = result.result[0].lineNumber;
      }
    } catch (e) {}
  }

  // 如果没找到 _$h4（变量名可能变了），搜索 XHR 相关模式
  if (!targetScriptId) {
    console.log('\n_$h4 not found, searching for XHR patterns...');
    const patterns = ['.send(', '.open(', 'XMLHttpRequest', 'r20SZOQm', 'onreadystatechange'];

    for (const [scriptId, info] of Object.entries(scripts)) {
      if (info.url) continue;
      for (const pattern of patterns) {
        try {
          const result = await client.send('Debugger.searchInContent', {
            scriptId,
            query: pattern,
            caseSensitive: false,
          });
          if (result.result && result.result.length > 0) {
            console.log(`  "${pattern}" in script ${scriptId}: ${result.result.length} matches`);
            if (result.result.length > 0 && result.result.length < 20) {
              result.result.slice(0, 3).forEach(r => {
                console.log(`    Line ${r.lineNumber}: ${r.lineContent?.substring(0, 80)}`);
              });
            }
          }
        } catch (e) {}
      }
    }
  }

  // 用 CDP 在位置 2:19686 设断点
  // initiator 报告的位置是 :2:19686（第 2 行，第 19686 列）
  // 注意：CDP 的 lineNumber 是 0-based，所以第 2 行 = lineNumber 1
  console.log('\n设置断点 at line 1 (0-based), column 19686...');

  // 找到最大的 eval 脚本（动态代码）
  let dynScriptId = null;
  let dynScriptLen = 0;
  for (const [scriptId, info] of Object.entries(scripts)) {
    if (info.url) continue;
    try {
      const src = await client.send('Debugger.getScriptSource', { scriptId });
      if (src.scriptSource.length > dynScriptLen) {
        dynScriptLen = src.scriptSource.length;
        dynScriptId = scriptId;
      }
    } catch (e) {}
  }

  if (dynScriptId) {
    console.log(`Dynamic code script: ${dynScriptId} (${dynScriptLen} chars)`);

    // 设置断点
    try {
      const bp = await client.send('Debugger.setBreakpoint', {
        location: {
          scriptId: dynScriptId,
          lineNumber: 1,
          columnNumber: 19686,
        },
      });
      console.log(`Breakpoint: ${bp.breakpointId}, status: ${bp.status}`);
      if (bp.actualLocation) {
        console.log(`  Actual: scriptId=${bp.actualLocation.scriptId} line=${bp.actualLocation.lineNumber} col=${bp.actualLocation.columnNumber}`);
      }
    } catch (e) {
      console.log(`Breakpoint error: ${e.message.substring(0, 80)}`);
    }

    // 设置 paused handler
    let pausedCount = 0;
    client.on('Debugger.paused', async (event) => {
      pausedCount++;
      console.log(`\n*** DEBUGGER PAUSED #${pausedCount} ***`);

      for (let i = 0; i < Math.min(event.callFrames.length, 10); i++) {
        const frame = event.callFrames[i];
        console.log(`\nFrame ${i}: ${frame.functionName || '(anon)'}`);
        console.log(`  Location: ${frame.location?.lineNumber}:${frame.location?.columnNumber}`);

        // 检查 arguments
        try {
          const argsResult = await client.send('Debugger.evaluateOnCallFrame', {
            callFrameId: frame.callFrameId,
            expression: `JSON.stringify(Array.from(arguments).map(a => typeof a === 'string' ? a.substring(0, 80) : typeof a === 'number' ? a : typeof a))`,
            returnByValue: true,
          });
          console.log(`  Arguments: ${argsResult.result.value}`);
        } catch (e) {}

        // 检查 this 的属性
        try {
          const thisResult = await client.send('Debugger.evaluateOnCallFrame', {
            callFrameId: frame.callFrameId,
            expression: `JSON.stringify(Object.keys(this).map(k => k + ':' + (typeof this[k] === 'string' ? this[k].substring(0, 30) : typeof this[k])).join(','))`,
            returnByValue: true,
          });
          console.log(`  This keys: ${thisResult.result.value?.substring(0, 200)}`);
        } catch (e) {}

        // 检查 URL 相关变量
        try {
          const urlResult = await client.send('Debugger.evaluateOnCallFrame', {
            callFrameId: frame.callFrameId,
            expression: `var r={};for(var k in this){var v=this[k];if(typeof v==='string'&&v.length>5){if(v.indexOf('r20SZOQm')>=0||v.indexOf('px-')>=0||v.indexOf('?')>=0){r[k]=v.substring(0,80);}}};JSON.stringify(r)`,
            returnByValue: true,
          });
          if (urlResult.result.value && urlResult.result.value !== '{}') {
            console.log(`  URL vars: ${urlResult.result.value}`);
          }
        } catch (e) {}

        // 检查局部变量中的字符串
        if (i < 5) {
          try {
            const localResult = await client.send('Debugger.evaluateOnCallFrame', {
              callFrameId: frame.callFrameId,
              expression: `var r={};try{var keys=Object.getOwnPropertyNames(this);for(var j=0;j<Math.min(keys.length,30);j++){var k=keys[j];var v;try{v=this[k]}catch(e){continue}if(typeof v==='string'&&v.length>10&&v.length<200){r[k]=v.substring(0,60)}}}catch(e){};JSON.stringify(r)`,
              returnByValue: true,
            });
            if (localResult.result.value && localResult.result.value !== '{}') {
              console.log(`  Local strings: ${localResult.result.value.substring(0, 300)}`);
            }
          } catch (e) {}

          // 检查局部变量中的数组
          try {
            const arrResult = await client.send('Debugger.evaluateOnCallFrame', {
              callFrameId: frame.callFrameId,
              expression: `var r={};try{var keys=Object.getOwnPropertyNames(this);for(var j=0;j<Math.min(keys.length,30);j++){var k=keys[j];var v;try{v=this[k]}catch(e){continue}if(Array.isArray(v)&&v.length>=8){var allBytes=true;for(var x=0;x<Math.min(v.length,5);x++){if(typeof v[x]!=='number'||v[x]<0||v[x]>255){allBytes=false;break}}if(allBytes){r[k]='arr['+v.length+']:['+v.slice(0,10).join(',')+']'}}}}catch(e){};JSON.stringify(r)`,
              returnByValue: true,
            });
            if (arrResult.result.value && arrResult.result.value !== '{}') {
              console.log(`  Local arrays: ${arrResult.result.value.substring(0, 400)}`);
            }
          } catch (e) {}
        }
      }

      // 只暂停前 3 次
      if (pausedCount >= 3) {
        console.log('\nReached pause limit, disabling breakpoint...');
        await client.send('Debugger.setBreakpointsActive', { active: false });
      }

      await client.send('Debugger.resume');
    });

    // Reload 触发请求
    console.log('\nReload...');
    await page.reload({ timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(15000);

    console.log(`\nQueries: ${capturedQueries.length}`);
    console.log(`Pauses: ${pausedCount}`);
  }

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-cdp-breakpoint-h4.json'),
    JSON.stringify({
      queries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      timestamp: new Date().toISOString(),
    }, null, 2)
  );

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
