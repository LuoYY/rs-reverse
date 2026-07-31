/**
 * query_vm_breakpoint.js — 在 VM dispatcher 入口设断点，捕获 query 生成
 *
 * 已知：RS VM dispatcher = _$dh(ctx, pc, len, args)
 * 通过 CDP initiator 获取当前位置
 * 设断点 → reload → 命中 → dump 变量
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== VM Dispatcher 断点捕获 ===\n');

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
  await client.send('Network.enable');

  // 收集脚本
  const scripts = {};
  client.on('Debugger.scriptParsed', (e) => { scripts[e.scriptId] = { url: e.url || '' }; });

  // 捕获 query
  const capturedQueries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) capturedQueries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  // Phase 1: 加载页面，获取 initiator 信息
  console.log('[Phase 1] 加载页面...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // 获取动态代码脚本
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
  console.log(`Dynamic code: ${dynScriptId} (${dynScriptLen} chars)`);

  // Phase 2: reload 获取 initiator
  console.log('\n[Phase 2] Reload 获取 initiator...');

  let initiatorInfo = null;
  const initiatorHandler = (event) => {
    const url = event.request.url;
    if (url.includes('r20SZOQm=') && !initiatorInfo) {
      initiatorInfo = {
        url: url.substring(0, 80),
        stack: event.initiator.stack?.callFrames?.slice(0, 5).map(f => ({
          fn: f.functionName || '(anon)',
          script: f.scriptId,
          line: f.lineNumber,
          col: f.columnNumber,
        })),
      };
    }
  };
  client.on('Network.requestWillBeSent', initiatorHandler);

  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);
  client.off('Network.requestWillBeSent', initiatorHandler);

  console.log(`Queries: ${capturedQueries.length}`);

  if (initiatorInfo) {
    console.log('\nInitiator:');
    console.log(`  Function: ${initiatorInfo.stack[0].fn}`);
    initiatorInfo.stack.forEach((f, i) => {
      console.log(`  [${i}] ${f.fn} at ${f.script}:${f.line}:${f.col}`);
    });

    // Phase 3: 在 VM dispatcher 设断点
    const dispScriptId = initiatorInfo.stack[0].script;
    const dispLine = initiatorInfo.stack[0].line;
    const dispCol = initiatorInfo.stack[0].col;

    console.log(`\n[Phase 3] 在 VM dispatcher 设断点...`);

    // 获取 dispatcher 脚本源码
    let dispSrc = null;
    try {
      const srcResult = await client.send('Debugger.getScriptSource', { scriptId: dispScriptId });
      dispSrc = srcResult.scriptSource;
      console.log(`Dispatcher script: ${dispScriptId} (${dispSrc.length} chars)`);
    } catch (e) {
      console.log(`Get source error: ${e.message.substring(0, 60)}`);
    }

    if (dispSrc) {
      // 找到 dispatcher 函数定义（在 initiator 位置附近向前搜索 function）
      const lines = dispSrc.split('\n');
      const targetLine = lines[dispLine] || '';

      // 向前搜索 function 关键字
      const before = targetLine.substring(0, dispCol);
      const funcIdx = before.lastIndexOf('function ');
      if (funcIdx >= 0) {
        console.log(`Dispatcher function at col ${funcIdx}`);

        // 设断点在函数入口 — 用 logpoint 方式（condition 返回 false，不暂停）
        // condition 中执行 console.log 输出变量值
        try {
          // 提取参数名
          const funcDef = dispSrc.substring(dispSrc.indexOf('function ', funcIdx));
          const pm = funcDef.match(/function\s+_\$[a-zA-Z0-9]+\(([^)]+)\)/);
          const pn = pm ? pm[1].split(',').map(s => s.trim()) : [];
          console.log(`  Param names: ${pn.join(', ')}`);

          // 用 condition 作为 logpoint
          // condition 表达式中可以访问局部变量
          // 返回 false 不暂停，但副作用（console.log）会执行
          const p0 = pn[0] || 'arguments[0]';
          const p3 = pn[3] || 'arguments[3]';
          const condition = `(function(){
            try {
              var c = ${p0}, a = ${p3};
              if (!window.__bpData) window.__bpData = [];
              var info = {
                bc: c ? (Object.values(c).find(function(v){return Array.isArray(v)&&v.length>20})||{length:0}).length : 0,
                al: a ? a.length : 0,
                a4: a && typeof a[4] === 'number' ? a[4] : -1,
                a5: a && typeof a[5] === 'string' ? a[5].substring(0, 80) : '',
              };
              if (a) for (var i = 0; i < Math.min(a.length, 10); i++) {
                if (typeof a[i] === 'string' && a[i].length > 5) info['s' + i] = a[i].substring(0, 50);
              }
              if (a) for (var i = 0; i < a.length; i++) {
                var v = a[i];
                if (Array.isArray(v) && v.length >= 8 && v.length <= 100) {
                  var ok = true;
                  for (var j = 0; j < 5; j++) { if (typeof v[j] !== 'number' || v[j] < 0 || v[j] > 255) { ok = false; break; } }
                  if (ok) info['a' + i] = '[' + v.length + ']:' + v.slice(0, 8).join(',');
                }
              }
              window.__bpData.push(info);
              if (window.__bpData.length > 200) window.__bpData.shift();
            } catch(e) { if (!window.__bpErr) window.__bpErr = []; window.__bpErr.push(e.message.substring(0, 50)); }
            return false;
          })()`;

          const bp = await client.send('Debugger.setBreakpoint', {
            location: {
              scriptId: dispScriptId,
              lineNumber: dispLine,
              columnNumber: funcIdx,
            },
            condition: condition,
          });
          console.log(`Logpoint: ${bp.breakpointId}`);
          if (bp.actualLocation) {
            console.log(`  Actual: line ${bp.actualLocation.lineNumber}, col ${bp.actualLocation.columnNumber}`);
          }
        } catch (e) {
          console.log(`Breakpoint error: ${e.message.substring(0, 80)}`);
        }

        // Phase 4: reload 触发 logpoint
        console.log('\n[Phase 4] Reload 触发 logpoint...');
        capturedQueries.length = 0;

        // 清除之前的数据
        await page.evaluate(() => { window.__bpData = []; window.__bpErr = []; }).catch(() => {});

        await page.reload({ timeout: 120000 }).catch(() => {});
        await page.waitForTimeout(15000);

        // 读取 logpoint 数据
        const bpData = await page.evaluate(() => ({
          data: window.__bpData || [],
          errors: window.__bpErr || [],
        })).catch(() => ({ data: [], errors: [] }));

        console.log(`\n=== 结果 ===`);
        console.log(`BP data entries: ${bpData.data.length}`);
        console.log(`BP errors: ${bpData.errors.length}`);
        if (bpData.errors.length > 0) console.log(`  Errors: ${bpData.errors.slice(0, 3).join('; ')}`);
        console.log(`Queries: ${capturedQueries.length}`);

        // 显示 BP 数据
        bpData.data.slice(0, 20).forEach((d, i) => {
          console.log(`\n  [${i}] bc=${d.bc} al=${d.al} a4=${d.a4} a5="${d.a5}"`);
          // 显示字符串
          const strs = Object.entries(d).filter(([k]) => k.startsWith('s'));
          if (strs.length > 0) {
            console.log(`      Strings: ${strs.map(([k, v]) => k + '=' + v).join(', ')}`);
          }
          // 显示数组
          const arrs = Object.entries(d).filter(([k]) => k.startsWith('a') && !k.startsWith('a4') && !k.startsWith('a5') && k !== 'al');
          if (arrs.length > 0) {
            console.log(`      Arrays: ${arrs.map(([k, v]) => k + '=' + v).join(', ')}`);
          }
        });

        capturedQueries.slice(0, 3).forEach((q, i) => console.log(`  Q[${i}] ${q.method} ${q.path} query=${q.query.substring(0, 40)}...`));

        // 保存
        fs.writeFileSync(
          path.join(ROOT, 'output/capture-20080/query-vm-logpoint.json'),
          JSON.stringify({
            queries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
            bpData: bpData.data.slice(0, 50),
            errors: bpData.errors,
            initiator: initiatorInfo,
            timestamp: new Date().toISOString(),
          }, null, 2)
        );
        console.log('\n结果已保存');
      }
    }
  } else {
    console.log('No initiator captured');
  }

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-vm-breakpoint.json'),
    JSON.stringify({
      queries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      initiator: initiatorInfo,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
