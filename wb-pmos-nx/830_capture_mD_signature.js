/**
 * 830_capture_mD_signature.js
 * 捕获 _$mD 全局对象表的"类型签名"（非完整对象，避免循环引用）
 * 每个索引：type + 可序列化摘要
 * 用于构建 Node 等价的全局 stub
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
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId,
        expression: `(function(){
          var out = {};
          try {
            if (typeof _$mD === 'undefined') { out.mD = 'undef'; return JSON.stringify(out); }
            var sig = [];
            for (var i = 0; i < _$mD.length; i++) {
              var v = _$mD[i];
              var t = typeof v;
              var item = { i: i, t: t };
              if (v === null) item.t = 'null';
              else if (v === undefined) item.t = 'undefined';
              else if (t === 'function') {
                item.fn = v.name || 'anon';
                // 尝试提取函数体签名
                var s = String(v);
                item.sign = s.substring(0, 60);
              } else if (t === 'object') {
                // 对象：提取 constructor + 关键属性
                try { item.c = v.constructor ? v.constructor.name : 'unknown'; } catch(e){ item.c = 'err'; }
                try {
                  var keys = Object.keys(v).slice(0, 10);
                  item.keys = keys;
                  // 提取可序列化属性值
                  var vals = {};
                  for (var j = 0; j < keys.length; j++) {
                    var val = v[keys[j]];
                    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') vals[keys[j]] = val;
                  }
                  item.vals = vals;
                } catch(e){}
              } else if (t === 'number' || t === 'string' || t === 'boolean') {
                item.v = v;
              }
              sig.push(item);
            }
            out.mD = JSON.stringify(sig);
            out.mDLen = _$mD.length;
          } catch(e){ out.mD = 'err:' + e.message.substring(0, 50); }
          return JSON.stringify(out);
        })()`,
        returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        if (d.mD && d.mD !== 'undef' && !d.mD.startsWith('err') && d.mD.length > 50) {
          // 检查是否捕获到完整表（有多个非 null 项）
          const sig = JSON.parse(d.mD);
          const nonNull = sig.filter(x => x.t !== 'null' && x.t !== 'undefined');
          if (nonNull.length > 30) {
            console.log('★★★ pause#' + pauseCount + ' 捕获完整 _$mD! 非null=' + nonNull.length + '/' + d.mDLen);
            captured = true;
            fs.writeFileSync('/tmp/nx_mD_sig.json', JSON.stringify(d, null, 1));
            console.log('已保存 /tmp/nx_mD_sig.json');
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
  console.log('[2] 完成, pauses=' + pauseCount + ' captured=' + captured);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });