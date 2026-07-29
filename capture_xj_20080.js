/**
 * Phase A — 抓取 pmos.xj.sgcc.com.cn:20080 浏览器真实产物
 *
 * 目的（纯算法验证用，非最终方案）：用 Patchright 反检测浏览器自然过瑞数，
 * 同时 hook eval 捕获外层 VM 生成的「内层动态代码」全文 + 校验和（=cp[3] 真值），
 * 并抓完整 $_ts、O/P cookie、XHR query 参数样本。
 *
 * 用法：
 *   NODE_OPTIONS=--dns-result-order=ipv4first \
 *   NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules \
 *   node capture_xj_20080.js [--headless]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('patchright');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT_DIR = path.join(__dirname, 'output', 'capture-20080');

// cp[3] 校验和算法（与管线 src/handler/Coder.js getScd/parseTs 一致：每 100 字符 charCodeAt 累加）
function checksum(code) {
  let sum = 0;
  for (let i = 0; i < code.length; i += 100) sum += code.charCodeAt(i);
  return sum;
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const headless = process.argv.includes('--headless');
  console.log('[capture] 启动 Patchright, headless=', headless);

  const browser = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();

  // ---- 产物收集容器 ----
  const capture = {
    url: TARGET,
    ts: null,               // { nsd, cd } 挑战页原始种子
    dynCandidates: [],      // eval 捕获的大段动态代码候选
    queryParams: [],        // XHR/fetch 带 ?xxx= 后缀的请求
    cookies: null,
  };

  // ---- 1. hook 动态代码执行通道（瑞数经 _$g6=_$at.eval; _$g6.call(_$at, code) 执行）----
  await context.addInitScript(() => {
    window.__dynCandidates = [];
    window.__evalCalls = [];   // 所有 eval 调用（诊断）
    const seen = new Set();
    const record = (src, code) => {
      try {
        const len = typeof code === 'string' ? code.length : 0;
        window.__evalCalls.push({ src, len, head: (typeof code === 'string' ? code.substring(0, 60) : typeof code) });
        if (typeof code === 'string' && code.length > 50000) {
          const key = code.length + ':' + code.slice(0, 40);
          if (!seen.has(key)) { seen.add(key); window.__dynCandidates.push({ src, len: code.length, head: code.substring(0, 80), code }); }
        }
      } catch (e) {}
    };
    const origCall = Function.prototype.call;
    const origApply = Function.prototype.apply;
    const origEval = window.eval;
    Function.prototype.call = function (thisArg, ...args) {
      if (this === origEval) record('eval.call', args[0]);
      return origCall.apply(this, [thisArg, ...args]);
    };
    Function.prototype.apply = function (thisArg, args) {
      if (this === origEval) record('eval.apply', args && args[0]);
      return origApply.apply(this, [thisArg, args]);
    };
    window.eval = function (code) { record('eval.direct', code); return origEval.call(window, code); };
    window.__getDyn = () => window.__dynCandidates.map(c => ({ src: c.src, len: c.len, head: c.head }));
  });

  // ---- 2. 网络监听：抓挑战页 ts + 动态代码 script 响应 + 带 query 后缀的请求 ----
  page.on('response', async (resp) => {
    try {
      const url = resp.url();
      const status = resp.status();
      const req = resp.request();
      const rtype = req.resourceType();
      // 挑战页 HTML（含 $_ts.nsd/cd）
      if (status === 412 || (url === TARGET && !capture.ts)) {
        const text = await resp.text().catch(() => '');
        const m = text.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
        if (m && !capture.ts) {
          capture.ts = { nsd: +m[1], cd: m[2], status };
          console.log('[capture] 挑战页 ts: nsd=', m[1], 'cd_len=', m[2].length);
        }
      }
      // 动态代码：200 的 script 元素响应（瑞数可能把内层 VM 作为 script 加载）
      if (status === 200 && rtype === 'script' && !/rGTR1U4jJCVr/.test(url)) {
        const text = await resp.text().catch(() => '');
        if (text && text.length > 50000) {
          console.log('[capture] 大型 script 响应:', url.substring(0, 90), 'len=', text.length);
          fs.writeFileSync(path.join(OUT_DIR, 'browser-dyn-code-net.js'), text);
          capture.dynCodeNet = { url: url.substring(0, 200), len: text.length, checksum: checksum(text) };
        }
      }
      // query 参数后缀（任何非静态资源请求；放宽资源类型）
      const qm = url.match(/[?&]([A-Za-z0-9]{6,12})=([^&\s]{20,})/);
      if (qm && !/\.(js|css|png|jpg|jpeg|gif|woff2?|svg|ico)(\?|$)/.test(url)) {
        capture.queryParams.push({ name: qm[1], value: qm[2], valueLen: qm[2].length, url: url.substring(0, 220), method: req.method(), rtype });
        console.log('[capture] query:', qm[1], 'len=', qm[2].length, req.method(), rtype, url.substring(0, 80));
      }
    } catch (e) {}
  });

  console.log('[capture] 导航到目标...');
  try { await page.goto(TARGET, { waitUntil: 'load', timeout: 45000 }); }
  catch (e) { console.log('[capture] 导航异常(可忽略):', e.message?.substring(0, 60)); }

  // 等瑞数验证跑完（412 → 生成动态代码 → 写 P cookie → reload → 200 真实页面）
  console.log('[capture] 等待瑞数验证 + 页面加载...');
  // 轮询 P cookie 出现（瑞数验证通过的标志）
  let pFound = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const cs = await context.cookies();
    if (cs.some(c => c.name.endsWith('P'))) { pFound = true; console.log(`[capture] P cookie 已生成(${i + 1}s)`); break; }
  }
  if (!pFound) console.log('[capture] ⚠ 20s 内未生成 P cookie');
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch (e) {}
  await page.waitForTimeout(3000);

  // 记录导航后所有请求（诊断 query 出现位置）
  const allReqs = await page.evaluate(() => (performance.getEntriesByType('resource') || []).map(r => r.name).filter(n => /[?&][A-Za-z0-9]{6,12}=/.test(n)).slice(0, 20)).catch(() => []);
  if (allReqs.length) console.log('[capture] performance 带参资源:', JSON.stringify(allReqs.map(u => u.substring(0, 100)), null, 1));

  // 触发同域 XHR（在真实页面上下文，RS hook 应自动加 query 后缀）
  console.log('[capture] 触发同域 XHR 抓 query...');
  await page.evaluate(() => {
    ['/'].forEach(p => {
      try { const x = new XMLHttpRequest(); x.open('GET', p, true); x.send(); } catch (e) {}
      try { const y = new XMLHttpRequest(); y.open('POST', p, true); y.setRequestHeader('Content-Type', 'application/json'); y.send('{}'); } catch (e) {}
    });
  });
  await page.waitForTimeout(4000);

  // ---- 3. 读动态代码候选 + $_ts + 页面最终状态 ----
  const dyn = await page.evaluate(() => (window.__dynCandidates || []).map(c => ({ src: c.src, len: c.len, head: c.head })));
  const evalCalls = await page.evaluate(() => (window.__evalCalls || []).slice(0, 20)).catch(() => []);
  console.log('[capture] eval 调用诊断:', JSON.stringify(evalCalls, null, 1));
  const finalUrl = page.url();
  const pageState = await page.evaluate(() => ({
    title: document.title,
    readyState: document.readyState,
    bodyLen: document.body ? document.body.innerHTML.length : 0,
    isChallenge: !!document.querySelector('script[r="m"]'),
  })).catch(() => ({}));
  const fullTs = await page.evaluate(() => {
    try { const t = window.$_ts || {}; return { nsd: t.nsd, hasCp: !!t.cp, cpLen: t.cp && t.cp.length, keys: Object.keys(t) }; }
    catch (e) { return { err: e.message }; }
  });
  console.log('[capture] 动态代码候选:', JSON.stringify(dyn));
  console.log('[capture] 页面状态:', JSON.stringify(pageState), 'finalUrl=', finalUrl);
  console.log('[capture] window.$_ts:', JSON.stringify(fullTs));

  // 取最大的一段动态代码（内层 VM）
  const dynFull = await page.evaluate(() => {
    const c = (window.__dynCandidates || []).slice().sort((a, b) => b.len - a.len)[0];
    return c ? { code: c.code, src: c.src } : null;
  });
  if (dynFull && dynFull.code) {
    fs.writeFileSync(path.join(OUT_DIR, 'browser-dyn-code.js'), dynFull.code);
    const sum = checksum(dynFull.code);
    capture.dynCode = { len: dynFull.code.length, checksum: sum, src: dynFull.src };
    console.log(`[capture] ✓ 动态代码已保存(${dynFull.src}) len=${dynFull.code.length} checksum(cp3)=${sum}`);
  } else {
    console.log('[capture] ✗ 未捕获到动态代码（所有 hook 均未触发）');
  }

  // ---- 4. cookies ----
  const cookies = await context.cookies();
  capture.cookies = cookies.map(c => ({ name: c.name, value: c.value, len: c.value.length }));
  const pC = cookies.find(c => c.name.endsWith('P'));
  const oC = cookies.find(c => c.name.endsWith('O'));
  console.log(`[capture] cookies: O=${oC ? oC.name + '(' + oC.value.length + ')' : 'N/A'}  P=${pC ? pC.name + '(' + pC.value.length + ')' : 'N/A'}`);

  capture.fullTs = fullTs;
  capture.pageState = { finalUrl, ...pageState };
  fs.writeFileSync(path.join(OUT_DIR, 'capture-result.json'), JSON.stringify({
    ...capture,
    dynCandidates: capture.dynCandidates.map(c => ({ src: c.src, len: c.len, head: c.head })),
  }, null, 2));

  // 单独存 cookie 字符串
  fs.writeFileSync(path.join(OUT_DIR, 'browser-cookies.txt'), cookies.map(c => `${c.name}=${c.value}`).join('; '));

  console.log('\n[capture] === 汇总 ===');
  console.log('  ts:', capture.ts ? `nsd=${capture.ts.nsd} cd_len=${capture.ts.cd.length}` : 'N/A');
  console.log('  dynCode:', capture.dynCode ? `len=${capture.dynCode.len} cp3=${capture.dynCode.checksum}` : 'N/A');
  console.log('  queryParams:', capture.queryParams.length, '条');
  console.log('  P cookie len:', pC ? pC.value.length : 'N/A');
  console.log('  输出目录:', OUT_DIR);

  await browser.close();
  console.log('[capture] 完成');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
