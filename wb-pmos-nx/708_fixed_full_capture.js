/**
 * 708_fixed_full_capture.js
 * 固定环境（reqable + nx-mock, nsd=67402）完整采集：
 * - dynCode 源码（外层 js + eval dynCode）→ 供静态反编译
 * - basearr 完整数组 + [25-28] push 时刻调用栈（条件断点存 Error().stack）
 * - P cookie + nsd/cd
 * 保存全套离线数据集
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';
const OUT = '/tmp/nx_fixed_dataset.json';

function sha(s) { return crypto.createHash('sha256').update(s).digest('hex').substring(0, 16); }

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: PROXY },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  // 收集所有脚本（含 dynCode）
  const scripts = [];
  cdp.on('Debugger.scriptParsed', (p) => {
    scripts.push({ scriptId: p.scriptId, length: p.length, url: (p.url || '').substring(0, 100) });
  });

  // 条件断点（单断点双条件）：len=28（[25-28] 构造时刻）→ 存数组+栈；len 170-190 → 存完整 basearr+栈
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length === 28 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__cap28) ? (window.__cap28 = Array.from(this), window.__stack28 = new Error().stack, true) : ((this.length >= 170 && this.length <= 190 && this.every(function(x){return typeof x === "number";}) && !window.__capFull) ? (window.__capFull = Array.from(this), window.__stackFull = new Error().stack, true) : false)',
  });

  let pauses = 0;
  cdp.on('Debugger.paused', async (params) => {
    pauses++;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] 加载固定环境页面...');
  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 35000));

  // 提取捕获数据
  const cap = {};
  for (const [k, expr] of [['cap28', 'JSON.stringify(window.__cap28)'], ['capFull', 'JSON.stringify(window.__capFull)'], ['stack28', 'JSON.stringify(window.__stack28)'], ['stackFull', 'JSON.stringify(window.__stackFull)']]) {
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      cap[k] = r.result?.value;
    } catch (e) { cap[k] = null; }
  }
  cap.basearr28 = cap.cap28 ? JSON.parse(cap.cap28) : null;
  cap.basearrFull = cap.capFull ? JSON.parse(cap.capFull) : null;
  if (cap.basearr28) console.log('[★] basearr[0-27] =', cap.basearr28.join(','));
  if (cap.basearrFull) console.log('[★] basearr len=' + cap.basearrFull.length, '头30:', cap.basearrFull.slice(0, 30).join(','));
  if (cap.stack28) console.log('[★] [25-28] 构造调用栈:\n' + cap.stack28.split('\n').slice(0, 10).join('\n'));

  // dynCode 源码
  const dyn = [];
  for (const s of scripts) {
    try {
      const r = await cdp.send('Debugger.getScriptSource', { scriptId: s.scriptId });
      const src = r.scriptSource || '';
      if (s.length > 100000) dyn.push({ length: s.length, url: s.url, sha: sha(src), source: src });
    } catch (e) {}
  }
  console.log('大脚本数:', dyn.length);
  dyn.forEach((d, i) => console.log(`  #${i} len=${d.length} url=${d.url || '(eval)'} sha=${d.sha}`));

  // 412 html 的 nsd/cd
  const html = fs.readFileSync('/tmp/nx_local_412.html', 'utf8');
  const m = html.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = m ? +m[1] : null;
  const cd = m ? m[2] : null;
  console.log('nsd=' + nsd, 'cd len=' + (cd ? cd.length : '?'));

  // P cookie
  const cookies = await context.cookies();
  const pCookie = cookies.find(c => /P$/.test(c.name))?.value || null;
  console.log('P cookie len:', pCookie ? pCookie.length : '无');

  // 保存全套
  const ds = { nsd, cd, pCookie, basearr28: cap.basearr28, basearrFull: cap.basearrFull, stack28: cap.stack28, stackFull: cap.stackFull, dyn: dyn.map(d => ({ length: d.length, url: d.url, sha: d.sha, source: d.source })), pauses };
  fs.writeFileSync(OUT, JSON.stringify(ds));
  console.log('已保存:', OUT, `(dynCode 源 ${dyn.length} 段, basearr28=${cap.basearr28 ? '有' : '无'})`);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
