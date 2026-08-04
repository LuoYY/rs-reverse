/**
 * 823_capture_programs.js
 * 捕获 VM 执行的每个 program（_$c4 调用参数）
 * 关键：$c4 是 VM 主解释器，每次调用接收一个 program（数组）
 * 方法：hook $c4 调用（通过 eval 生成的 IIFE 内部 trampoline），记录 program 参数
 * 用 addInitScript 包装 Array.prototype.push 捕获 program 数组（opcode 流）
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

  // 注入：hook $c4 调用（记录 program 参数）
  // 方法：hook Function.prototype.apply（$c4 用 apply 调用）
  // 或：hook Array.prototype.push（trampoline $lB 用 push.apply 构造调用栈）
  await page.addInitScript(() => {
    window.__progs = [];
    window.__bases = [];
    // hook push（trampoline 构造 _$a5 调用栈）
    const origPush = Array.prototype.push;
    Array.prototype.push = function (...args) {
      const r = origPush.apply(this, args);
      // _$a5 是 [opcode, ...args] 调用栈（trampoline）
      try {
        if (this.length >= 2 && typeof this[0] === 'number' && this[0] > 1000) {
          // trampoline 调用栈：opcode + 参数
          const op = this[0];
          const arg1 = this[1];
          // 尝试记录 program 类 数组
          if (Array.isArray(arg1) && arg1.length >= 50 && typeof arg1[0] === 'number') {
            const h = Array.from(arg1).slice(0, 20);
            if (h[0] !== 113 && h[0] !== 179) {
              window.__progs.push({ op, head: h, len: arg1.length });
              if (window.__progs.length > 30) window.__progs.shift();
            }
          }
        }
        // base 数组检测
        if (this.length >= 100 && this.length <= 270 && typeof this[0] === 'number' && this[0] === 179) {
          window.__bases.push(Array.from(this));
          window.__lastBase = Array.from(this);
        }
      } catch (e) {}
      return r;
    };
    // 也监控 _$c4 直接调用（通过 $c4.apply）
    const origApply = Function.prototype.apply;
    Function.prototype.apply = function (thisArg, argsArray) {
      // 如果 this 是 $c4 且 args 是 program 数组
      try {
        const fnName = this.name || '';
        if (fnName === '_$c4' && argsArray && Array.isArray(argsArray[0])) {
          const p = argsArray[0];
          if (p.length >= 50 && typeof p[0] === 'number' && p[0] < 1000) {
            window.__progs.push({ via: 'apply', head: Array.from(p).slice(0, 30), len: p.length });
            if (window.__progs.length > 30) window.__progs.shift();
          }
        }
      } catch (e) {}
      return origApply.call(this, thisArg, argsArray);
    };
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));

  const res = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({progs: window.__progs, bases: (window.__bases||[]).length, lastBase: window.__lastBase ? Array.from(window.__lastBase).slice(0, 12) : []})', returnByValue: true });
  const v = res.result?.value;
  console.log('[2] 捕获结果:', String(v).substring(0, 2000));
  fs.writeFileSync('/tmp/nx_programs_capture.json', v);
  console.log('[3] 已保存 /tmp/nx_programs_capture.json');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });