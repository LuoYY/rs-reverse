/**
 * 728_A236b_capture_vm_tables.js
 * base 生成时刻捕获内层 VM 全表 + program（为独立执行器提供输入）
 * 断点 Array.push：捕获 130-260 数字数组
 *  - 第 1 个 = 明文 basearr（[0]==113）
 *  - 第 2 个 = base（[0]!=113）
 * 在 base push 时刻 dump：_$hr（program）、_$lU/_$oR/_$fW/_$hl/_$iz/_$c$/_$ha/_$dR/_$aI 表、cap
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

  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: 'this && this.length >= 160 && this.length <= 270 && typeof this[0] === "number" && this[0] >= 0 && this[0] < 256 ? (window.__arrCount = (window.__arrCount || 0) + 1, window.__lastArr = Array.from(this), window.__lastLen = this.length, true) : false',
  });

  let done = false;
  let bpCount = 0;
  const handler = async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    bpCount++;
    try {
      const info = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({count: window.__arrCount || 0, len: window.__lastLen || 0, head: window.__lastArr ? Array.from(window.__lastArr).slice(0, 12) : []})', returnByValue: true });
      if (bpCount <= 8) console.log('[bp#' + bpCount + ']', info.result?.value);
      const inf = JSON.parse(info.result?.value || '{}');
      // base = 160-270 数组且 [0]!=113（非明文 basearr）
      if (inf.len >= 160 && inf.head && inf.head[0] !== 113) {
        done = true;
        cdp.off('Debugger.paused', handler);
        console.log('★ base 捕获 bp#' + bpCount + ' len=' + inf.len + ' head=' + JSON.stringify(inf.head));
        const fullArr = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(Array.from(window.__lastArr))', returnByValue: true });
        const out = { baseArr: JSON.parse(fullArr.result?.value || '[]'), len: inf.len, programs: [], tables: {} };
        // 从调用帧收集 VM 表 + program
        const frames = params.callFrames || [];
        for (let fi = 0; fi < Math.min(frames.length, 6); fi++) {
          const f = frames[fi];
          try {
            const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
              callFrameId: f.callFrameId,
              expression: `(function(){
                var out = {};
                try { if (typeof _$hr !== 'undefined') out.hrLen = (_$hr||[]).length; } catch(e){}
                try { if (typeof _$hr !== 'undefined') out.hr = JSON.stringify((_$hr||[]).filter(Boolean).map(function(p){ var o={}; try{o.gS=typeof p._$gS==='string'?Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}):null;}catch(e){} try{o.my=(p._$my||[]).length;}catch(e){} try{o.jR=(p._$jR||[]).length;}catch(e){} try{o.iH=p._$iH;}catch(e){} try{o.fL=p._$fL;}catch(e){} try{o.fB=p._$fB;}catch(e){} try{o.g9=p._$g9;}catch(e){} try{o.db=p._$db;}catch(e){} return o; })); } catch(e){}
                try { if (typeof _$lU !== 'undefined') out.lU = String(_$lU).substring(0, 50); } catch(e){}
                try { if (typeof _$oR !== 'undefined') out.oR = String(_$oR).substring(0, 50); } catch(e){}
                try { if (typeof _$fW !== 'undefined') out.fW = String(_$fW).substring(0, 50); } catch(e){}
                try { if (typeof _$hl !== 'undefined') out.hl = String(_$hl).substring(0, 50); } catch(e){}
                try { if (typeof _$iz !== 'undefined') out.iz = String(_$iz).substring(0, 50); } catch(e){}
                try { if (typeof _$c$ !== 'undefined') out.c$ = String(_$c$).substring(0, 50); } catch(e){}
                try { if (typeof _$ha !== 'undefined') out.ha = String(_$ha).substring(0, 50); } catch(e){}
                try { if (typeof _$dR !== 'undefined') out.dR = String(_$dR).substring(0, 50); } catch(e){}
                try { if (typeof _$aI !== 'undefined') out.aI = String(_$aI).substring(0, 50); } catch(e){}
                try { if (typeof _$ok !== 'undefined') out.ok = String(_$ok).substring(0, 80); } catch(e){}
                try { if (typeof _$$L !== 'undefined') out.L = String(_$$L).substring(0, 50); } catch(e){}
                try { if (typeof _$cr !== 'undefined') out.crLen = (_$cr||[]).length; } catch(e){}
                return JSON.stringify(out);
              })()`,
              returnByValue: true,
            });
            const v = rr.result?.value;
            if (v && v !== 'undefined') {
              const parsed = JSON.parse(v);
              out.programs.push({ frame: fi, fn: f.functionName, ...parsed });
              console.log('帧' + fi + ' (' + f.functionName + '): hr=' + (parsed.hrLen || 0) + ' ' + Object.keys(parsed).filter(k => k !== 'hr').map(k => k + ':' + String(parsed[k]).substring(0, 30)).join(' '));
            }
          } catch (e) {}
        }
        fs.writeFileSync('/tmp/nx_base_vm_tables.json', JSON.stringify(out));
        await cdp.send('Debugger.resume').catch(() => {});
        return;
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 45000));
  try {
    const st = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({count: window.__arrCount, monitor: window.__monitor})', returnByValue: true });
    console.log('[1.5] 断点统计:', st.result?.value);
  } catch (e) {}
  await browser.close();
  const exists = fs.existsSync('/tmp/nx_base_vm_tables.json');
  console.log('[2] 捕获文件:', exists ? '写入完成' : '未写入');
  if (exists) {
    const d = JSON.parse(fs.readFileSync('/tmp/nx_base_vm_tables.json', 'utf8'));
    console.log('[3] programs:', d.programs.length, 'base:', JSON.stringify(d.baseArr));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
