/**
 * 817_capture_k0.js
 * hook VM 主解释器 _$c4 的 _\$k0 数组（VM 数组构造区），捕获 base（[0]===179）
 * 方法：在 eval 生成的 VM JS 中，_$c4 是主解释器，_$k0 是数组区
 * 找到 _$c4 的 while(1) 主循环断点，检查 _\$k0 内容
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

  // 注入监控：hook Object/Array 以捕获 base 数组构造
  // 更可靠：周期轮询 _$k0（但闭包变量访问不到）
  // 用 Proxy 包装 Array 构造？VM 可能用普通数组
  // 实际方案：在 _$c4 函数的 while(1) 主循环设置断点（Debugger.setBreakpointByUrl）
  // 但 eval 生成的 JS 是动态的，没有 URL
  // 方案：先捕获 eval 生成的 JS（816 已做），提取 _$c4 特征，然后用 setBreakpointByUrl 在 eval 脚本上断点
  // eval 脚本的 URL 是空或 vm 风格
  // 更简单：使用 Debugger.setBreakpointOnFunctionCall 在 _$c4 上断点
  // 但 _$c4 在 eval 后定义，需要先 eval 后再取引用

  // 方案：用 addInitScript 注入一个监控器，在 VM 执行时轮询 window 上的 VM 状态
  // VM 的数组可能在 window 某个属性上（如 $_ts.aebi）
  // 816 已捕获 eval 生成的 JS，现在分析它如何暴露 base

  // 直接：hook Array.prototype.push 更精确——检查 push 的数组是否是 base 数组
  // 之前在 815 用的 arguments[0]，但可能 base 不是 push 的
  // 用 _\$k0 引用：TODO 需在 VM 内访问

  console.log('[1] 用 apply 断点捕获 push 到 179 开头数组');
  await page.addInitScript(() => {
    window.__bases = [];
    const origPush = Array.prototype.push;
    Array.prototype.push = function (...args) {
      const r = origPush.apply(this, args);
      // 检查 this 是否变成 179 开头数组
      try {
        if (this.length >= 100 && this.length <= 270 && typeof this[0] === 'number' && this[0] === 179) {
          window.__bases.push(Array.from(this));
          // 同时捕获 VM 上下文引用
          window.__lastBase = Array.from(this);
          window.__lastBaseLen = this.length;
        }
      } catch (e) {}
      return r;
    };
  });

  console.log('[2] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 45000));

  const res = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({bases: (window.__bases||[]).length, lastBase: window.__lastBase ? Array.from(window.__lastBase).slice(0, 12) : [], lastLen: window.__lastBaseLen || 0})', returnByValue: true });
  console.log('[3] 捕获结果:', res.result?.value);
  const parsed = JSON.parse(res.result?.value || '{}');
  if (parsed.bases > 0) {
    fs.writeFileSync('/tmp/nx_base_k0.json', JSON.stringify({ bases: window.__bases, lastBase: parsed.lastBase }, null, 1));
    console.log('[4] 已保存 /tmp/nx_base_k0.json');
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });