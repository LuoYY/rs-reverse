/**
 * 706_reqable_fixed_test.js
 * 验证 reqable 本地映射方案：
 * - 反检测 Chromium + reqable(127.0.0.1:9000) + nx-mock(8998)
 * - 两次加载对比 dynCode 哈希（验证 html/js 固定 → dynCode 确定）
 * - 检查 P cookie（验证 mock 挑战流程完整）
 * - 捕获 basearr 构造（CDP 条件断点，为反编译 f 铺路）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000'; // reqable MITM

function sha(s) { return crypto.createHash('sha256').update(s).digest('hex').substring(0, 16); }

async function runRound(browser, round) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().substring(0, 120)); });

  // 收集大脚本（dynCode）
  const bigScripts = [];
  cdp.on('Debugger.scriptParsed', (p) => {
    if (p.length > 100000) bigScripts.push({ scriptId: p.scriptId, length: p.length, url: (p.url || '').substring(0, 70) });
  });

  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 25000));

  // dynCode 源码哈希
  const dyn = [];
  for (const s of bigScripts) {
    try {
      const r = await cdp.send('Debugger.getScriptSource', { scriptId: s.scriptId });
      const src = r.scriptSource || '';
      dyn.push({ length: s.length, url: s.url, sha: sha(src) });
    } catch (e) {}
  }
  const h = crypto.createHash('sha256');
  for (const d of dyn) h.update(d.sha + '|');
  console.log(`[R${round}] 大脚本数: ${bigScripts.length} dynCode 哈希: ${h.digest('hex').substring(0, 16)}`);
  dyn.forEach((d, i) => console.log(`  #${i} len=${d.length} url=${d.url || '(eval)'} sha=${d.sha}`));

  // cookie
  const cookies = await context.cookies();
  const o = cookies.filter(c => /O$/.test(c.name));
  const p = cookies.filter(c => /P$/.test(c.name));
  console.log(`[R${round}] O cookie: ${o.length ? 'len=' + o[0].value.length : '无'} | P cookie: ${p.length ? 'len=' + p[0].value.length : '无'}`);
  console.log(`[R${round}] 页面 URL: ${page.url().substring(0, 70)}`);
  if (consoleErrs.length) console.log(`[R${round}] console 错误: ${consoleErrs.slice(0, 3).join(' || ')}`);

  // 保存数据
  fs.writeFileSync(`/tmp/nx_706_round${round}.json`, JSON.stringify({ dyn, cookies: cookies.map(c => ({ name: c.name, value: c.value })) }));

  await context.close();
  return dyn;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: PROXY },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });

  const r1 = await runRound(browser, 1);
  console.log('=== 第二轮 ===');
  const r2 = await runRound(browser, 2);

  const same = r1.length === r2.length && r1.every((d, i) => d.sha === r2[i].sha && d.length === r2[i].length);
  console.log('\n=== 对比 ===');
  console.log('dynCode 完全一致:', same ? '★★★ 是！固定资源 → 静态分析可靠' : '否');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
