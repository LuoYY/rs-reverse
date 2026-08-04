/**
 * 815_capture_base_fixed.js
 * 修复版捕获脚本：base 是作为元素 push 进 _$_T 栈，应检查 arguments[0]
 * 断点条件：arguments[0] 是数组且 [0]===179（base）或 [0]===113（明文）
 * 捕获：base 数组 + VM 表（_$eb/_$k2/_$mv/_$kH/_$no/_$c2/_$aw/_$ip/_$oN/_$gq/_$eB/_$ae/_$mC/_$cr/_$T/_$hr）
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

  // 断点条件：arguments[0] 是数组且长度 130-270 且 [0]===113 (明文) 或 [0]===179 (base)
  // 注意：arguments[0] 是 push 的元素
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: `(function(){
      var a = arguments[0];
      if (a && typeof a === 'object' && typeof a.length === 'number' && a.length >= 100 && a.length <= 270 && typeof a[0] === 'number') {
        if (a[0] === 113) { window.__plainArr = Array.from(a); window.__plainLen = a.length; return true; }
        if (a[0] === 179) { window.__baseArr = Array.from(a); window.__baseLen = a.length; return true; }
      }
      return false;
    })()`,
  });

  let done = false;
  let bpCount = 0;
  const handler = async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    bpCount++;
    try {
      const info = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({plain: window.__plainLen || 0, base: window.__baseLen || 0, plainHead: window.__plainArr ? Array.from(window.__plainArr).slice(0, 6) : []})', returnByValue: true });
      const inf = JSON.parse(info.result?.value || '{}');
      if (bpCount <= 10) console.log('[bp#' + bpCount + ']', info.result?.value);

      // base 捕获
      if (inf.base > 0) {
        done = true;
        cdp.off('Debugger.paused', handler);
        console.log('★ base 捕获 bp#' + bpCount + ' len=' + inf.base);
        const out = { baseArr: null, plainArr: null, programs: [], tables: {} };
        // 读 base 数组
        const baseR = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(Array.from(window.__baseArr))', returnByValue: true });
        out.baseArr = JSON.parse(baseR.result?.value || '[]');
        // 读明文
        const plainR = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(Array.from(window.__plainArr || []))', returnByValue: true });
        out.plainArr = JSON.parse(plainR.result?.value || '[]');

        // 从调用帧收集 VM 表 + program
        const frames = params.callFrames || [];
        for (let fi = 0; fi < Math.min(frames.length, 8); fi++) {
          const f = frames[fi];
          try {
            const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
              callFrameId: f.callFrameId,
              expression: `(function(){
                var out = {};
                try { out.fn = arguments.callee.name; } catch(e){}
                try { if (typeof _$hr !== 'undefined') out.hr = JSON.stringify((_$hr||[]).filter(Boolean).map(function(p){ var o={}; try{o.gS=typeof p._$gS==='string'?Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}):null;}catch(e){} try{o.my=(p._$my||[]).length;}catch(e){} try{o.jR=(p._$jR||[]).length;}catch(e){} try{o.iH=p._$iH;}catch(e){} try{o.fL=p._$fL;}catch(e){} return o; })); } catch(e){}
                try { if (typeof _$eb !== 'undefined') out.eb = JSON.stringify(Array.from(_$eb||[])); } catch(e){}
                try { if (typeof _$k2 !== 'undefined') out.k2 = JSON.stringify(Array.from(_$k2||[])); } catch(e){}
                try { if (typeof _$mv !== 'undefined') out.mv = JSON.stringify(Array.from(_$mv||[])); } catch(e){}
                try { if (typeof _$kH !== 'undefined') out.kH = JSON.stringify(Array.from(_$kH||[])); } catch(e){}
                try { if (typeof _$no !== 'undefined') out.no = JSON.stringify(Array.from(_$no||[])); } catch(e){}
                try { if (typeof _$c2 !== 'undefined') out.c2 = JSON.stringify(Array.from(_$c2||[])); } catch(e){}
                try { if (typeof _$aw !== 'undefined') out.aw = JSON.stringify(Array.from(_$aw||[])); } catch(e){}
                try { if (typeof _$ip !== 'undefined') out.ip = JSON.stringify(Array.from(_$ip||[])); } catch(e){}
                try { if (typeof _$oN !== 'undefined') out.oN = JSON.stringify(Array.from(_$oN||[])); } catch(e){}
                try { if (typeof _$gq !== 'undefined') out.gq = JSON.stringify(Array.from(_$gq||[])); } catch(e){}
                try { if (typeof _$eB !== 'undefined') out.eB = JSON.stringify(Array.from(_$eB||[])); } catch(e){}
                try { if (typeof _$ae !== 'undefined') out.ae = JSON.stringify(Array.from(_$ae||[])); } catch(e){}
                try { if (typeof _$mC !== 'undefined') out.mC = JSON.stringify(Array.from(_$mC||[])); } catch(e){}
                try { if (typeof _$cr !== 'undefined') out.cr = JSON.stringify(Array.from(_$cr||[])); } catch(e){}
                try { if (typeof _$_T !== 'undefined') out.T = JSON.stringify((_$_T||[]).slice(0, 300)); } catch(e){}
                try { if (typeof _$bk !== 'undefined') out.bk = JSON.stringify(Array.from(_$bk||[])); } catch(e){}
                try { if (typeof _$pI !== 'undefined') out.pI = JSON.stringify(Array.from(_$pI||[])); } catch(e){}
                return JSON.stringify(out);
              })()`,
              returnByValue: true,
            });
            const v = rr.result?.value;
            if (v && v !== 'undefined') {
              const parsed = JSON.parse(v);
              out.programs.push({ frame: fi, fn: f.functionName, ...parsed });
              console.log('帧' + fi + ' (' + f.functionName + '): hr=' + (parsed.hr ? '有' : '无') + ' eb=' + (parsed.eb ? '有' : '无') + ' k2=' + (parsed.k2 ? '有' : '无') + ' T=' + (parsed.T ? '有' : '无'));
            }
          } catch (e) {}
        }
        fs.writeFileSync('/tmp/nx_base_capture.json', JSON.stringify(out, null, 1));
        console.log('已保存 /tmp/nx_base_capture.json (base len=' + out.baseArr.length + ' 明文 len=' + out.plainArr.length + ' programs=' + out.programs.length + ')');
        await cdp.send('Debugger.resume').catch(() => {});
        return;
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  try {
    const st = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({plain: window.__plainLen, base: window.__baseLen})', returnByValue: true });
    console.log('[1.5] 捕获统计:', st.result?.value);
  } catch (e) {}
  await browser.close();
  console.log('[2] 完成, bpCount=' + bpCount);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });