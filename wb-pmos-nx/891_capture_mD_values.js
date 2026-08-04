/**
 * 891_capture_mD_values.js
 * 捕获 _\$mD 的真实值（可序列化 + truthiness）
 * 关键：VM 的 _\$lj 检查用 _\$mD[1]/[19]/[62] 等布尔值
 * 捕获这些值 → 精确匹配 sandbox 环境
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
        const c4Pos = src.scriptSource.indexOf('function _$c4');
        const line = src.scriptSource.substring(0, c4Pos).split('\n').length - 1;
        try {
          await cdp.send('Debugger.setBreakpointByUrl', { scriptId: params.scriptId, lineNumber: line });
          console.log('[breakpoint] _$c4 断点 @line ' + line);
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
      // 捕获 _\$mD 的 truthiness 映射 + 可序列化值
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId,
        expression: `(function(){
          var out = {};
          try {
            if (typeof _$mD === 'undefined') { out.status = 'no_mD'; return JSON.stringify(out); }
            var truth = [];
            var vals = [];
            for (var i = 0; i < _$mD.length; i++) {
              var v = _$mD[i];
              truth.push(!!v ? 1 : 0);
              if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v === null || v === undefined) {
                vals.push(v === null ? 'null' : v === undefined ? 'undef' : v);
              } else {
                vals.push(typeof v === 'function' ? 'fn:' + (v.name || 'anon') : 'obj:' + (v.constructor ? v.constructor.name : '?'));
              }
            }
            out.status = 'ok';
            out.mDLen = _$mD.length;
            out.truth = truth;
            out.vals = vals;
            // 也捕获 _\$oU 状态
            out.oU = typeof _$oU !== 'undefined' ? 'defined' : 'undefined';
            out.oUType = typeof _$oU;
            // 捕获 _\$kB
            out.kB = typeof _$kB !== 'undefined' ? 'defined' : 'undefined';
            // 捕获 _\$jc（当前 opcode）
            out.jc = typeof _$jc !== 'undefined' ? _$jc : '?';
          } catch(e){ out.status = 'err:' + e.message; }
          return JSON.stringify(out);
        })()`,
        returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        if (d.status === 'ok') {
          console.log('pause#' + pauseCount + ' mDlen=' + d.mDLen + ' oU=' + d.oU + ' jc=' + d.jc + ' kB=' + d.kB);
          captured = true;
          fs.writeFileSync('/tmp/nx_mD_values.json', JSON.stringify(d, null, 1));
          console.log('已保存 /tmp/nx_mD_values.json');
        }
      }
    } catch (e) {}
    if (pauseCount > 200) captured = true;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成, pauses=' + pauseCount + ' captured=' + captured);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });