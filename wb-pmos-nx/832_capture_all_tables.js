/**
 * 832_capture_all_tables.js
 * 捕获 VM 的所有全局表（运行时快照）
 * 在 _$c4 断点帧内 evaluate 完整表（_$mD/_$a2/_$oU/_$b1/_$lc/_$k0/_$oN/_$e5 等）
 * 用函数 toString 替代对象（避免循环引用）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MOCK_DIR = '/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock';

const TABLES = ['_$mD', '_$a2', '_$oU', '_$b1', '_$lc', '_$k0', '_$oN', '_$e5', '_$k2', '_$mv', '_$kH', '_$no', '_$c2', '_$aw', '_$ip', '_$gq', '_$eB', '_$ae', '_$cr', '_$bk', '_$oR', '_$k3', '_$r0', '_$h1', '_$c1', '_$vl', '_$n1', '_$j2', '_$i1', '_$p1', '_$m1', '_$f1', '_$d1', '_$w1', '_$s1', '_$t1', '_$v1', '_$u1', '_$g1', '_$h1', '_$e1', '_$r1', '_$q1', '_$o1', '_$n1', '_$m1', '_$l1', '_$k1', '_$j1', '_$i1', '_$h1', '_$g1', '_$f1', '_$e1', '_$d1', '_$c1', '_$b1', '_$a1', '_$z1', '_$y1', '_$x1', '_$w1', '_$v1', '_$u1', '_$t1', '_$s1', '_$r1', '_$q1', '_$p1', '_$o1', '_$n1', '_$m1'];

(async () => {
  const raw = fs.readFileSync(path.join(MOCK_DIR, '412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  await page.route('**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    try {
      if (pathname === '/') {
        await route.fulfill({ status: 412, contentType: 'text/html;charset=utf-8', body: rawBody });
        return;
      }
      const file = path.join(MOCK_DIR, pathname);
      if (fs.existsSync(file)) {
        await route.fulfill({ status: 200, contentType: pathname.endsWith('.js') ? 'application/javascript' : 'text/plain', body: fs.readFileSync(file, 'utf8') });
        return;
      }
    } catch (e) {}
    await route.continue().catch(() => {});
  });

  let captured = false;
  let pauseCount = 0;
  let bestCapture = null;

  cdp.on('Debugger.scriptParsed', async (params) => {
    if (captured) return;
    try {
      const src = await cdp.send('Debugger.getScriptSource', { scriptId: params.scriptId });
      if (src.scriptSource && src.scriptSource.includes('function _$c4') && src.scriptSource.length > 100000) {
        console.log('[scriptParsed] 找到 _$c4 脚本');
        try {
          await cdp.send('Debugger.setBreakpointByUrl', { scriptId: params.scriptId, lineNumber: 0 });
        } catch (e) {}
      }
    } catch (e) {}
  });

  cdp.on('Debugger.paused', async (params) => {
    if (captured) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    pauseCount++;
    try {
      const frames = params.callFrames || [];
      const f0 = frames[0];
      // 构建 evaluate 表达式：捕获所有表
      const expr = `(function(){
        var out = {};
        var TABLES = ${JSON.stringify(TABLES)};
        for (var i = 0; i < TABLES.length; i++) {
          var name = TABLES[i];
          try {
            var v = eval(name);
            if (typeof v === 'undefined') continue;
            if (Array.isArray(v)) {
              // 数组：捕获类型 + 前 N 元素
              var sig = [];
              for (var j = 0; j < Math.min(v.length, 50); j++) {
                var item = v[j];
                var t = typeof item;
                if (item === null) sig.push('null');
                else if (t === 'number') sig.push('n:' + item);
                else if (t === 'string') sig.push('s:' + item.substring(0, 20));
                else if (t === 'boolean') sig.push('b:' + item);
                else if (t === 'function') sig.push('f:' + (item.name || 'anon'));
                else if (t === 'object') sig.push('o:' + (item.constructor ? item.constructor.name : '?'));
                else sig.push(t);
              }
              out[name] = { type: 'array', len: v.length, sig: sig };
            } else if (typeof v === 'function') {
              out[name] = { type: 'function', name: v.name, src: String(v).substring(0, 100) };
            } else if (typeof v === 'object') {
              out[name] = { type: 'object', keys: Object.keys(v).slice(0, 20) };
            } else {
              out[name] = { type: typeof v, val: v };
            }
          } catch(e) {}
        }
        return JSON.stringify(out);
      })()`;
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId,
        expression: expr,
        returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        const tableCount = Object.keys(d).length;
        if (tableCount > 10 && (!bestCapture || tableCount > Object.keys(bestCapture).length)) {
          bestCapture = d;
          console.log('pause#' + pauseCount + ' 捕获表数: ' + tableCount);
          if (tableCount > 20) {
            captured = true;
            fs.writeFileSync('/tmp/nx_vm_tables_all.json', JSON.stringify(d, null, 1));
            console.log('已保存 /tmp/nx_vm_tables_all.json');
          }
        }
      }
    } catch (e) {}
    if (pauseCount > 300) captured = true;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成, pauses=' + pauseCount + ' captured=' + captured + ' bestTables=' + (bestCapture ? Object.keys(bestCapture).length : 0));
  if (bestCapture && !captured) fs.writeFileSync('/tmp/nx_vm_tables_all.json', JSON.stringify(bestCapture, null, 1));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });