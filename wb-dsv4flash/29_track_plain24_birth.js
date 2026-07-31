/**
 * 29_track_plain24_birth.js
 *
 * 捕获 plain24（24B 数组）的构造过程（超时安全版）：
 *   - reload 完成后才注入 hook（避免影响 RS 初始化）
 *   - 只捕获长度 24 的数组（轻量，只做长度判断）
 *   - 总超时 240s 强制导出
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('超时: ' + label + ' ' + ms + 'ms')), ms)),
  ]);
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  console.log('[1] 启动...');
  const browser = await withTimeout(chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] }), 60000, 'launch');
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  console.log('[2] 加载 + reload（等 RS 初始化完成）...');
  await withTimeout(page.goto(TARGET, { timeout: 90000 }).catch(() => {}), 100000, 'goto');
  await delay(5000);
  await withTimeout(page.reload({ timeout: 90000 }).catch(() => {}), 100000, 'reload');
  await delay(12000); // 等 RS 完全初始化

  // 注入 hook（此时 RS 已初始化，hook 只影响 query 生成）
  console.log('[3] 注入 hook（push + slice + concat，捕获 24B）...');
  const hookR = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      if (window.__pushHooked) return 'already';
      var records = [];
      window.__pushRecords = records;
      var count = 0;
      function record(tag, content, stack) {
        if (count < 80) {
          count++;
          records.push({ tag: tag, len: content.length, content: content.slice(0, 88), stack: stack.substring(0, 1500) });
        }
      }
      var origPush = Array.prototype.push;
      Array.prototype.push = function() {
        try {
          var nl = this.length + arguments.length;
          if (nl === 24 && this.length <= 16) {
            var content = [];
            for (var i = 0; i < this.length; i++) content.push(this[i]);
            for (var j = 0; j < arguments.length; j++) content.push(arguments[j]);
            record('push', content, (new Error()).stack);
          }
        } catch (e) {}
        return origPush.apply(this, arguments);
      };
      var origSlice = Array.prototype.slice;
      Array.prototype.slice = function() {
        try {
          var r = origSlice.apply(this, arguments);
          if (r && r.length === 24) record('slice', r, (new Error()).stack);
          return r;
        } catch (e) { return origSlice.apply(this, arguments); }
      };
      var origConcat = Array.prototype.concat;
      Array.prototype.concat = function() {
        try {
          var r = origConcat.apply(this, arguments);
          if (r && r.length === 24) record('concat', r, (new Error()).stack);
          return r;
        } catch (e) { return origConcat.apply(this, arguments); }
      };
      var origFrom = Array.from;
      Array.from = function() {
        try {
          var r = origFrom.apply(this, arguments);
          if (r && r.length === 24) record('from', r, (new Error()).stack);
          return r;
        } catch (e) { return origFrom.apply(this, arguments); }
      };
      window.__pushHooked = true;
      return 'ok';
    })()`,
    returnByValue: true,
  });
  console.log('  hook:', hookR.result.value);

  // 触发 query（带超时）
  console.log('[4] 触发 POST...');
  let trigResult = 'ERR';
  try {
    const trig = await withTimeout(cdp.send('Runtime.evaluate', {
      expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
      returnByValue: true,
    }), 60000, 'trigger');
    trigResult = trig.result.value;
  } catch (e) {
    console.log('  触发超时:', e.message);
  }
  console.log('[4] 触发结果:', trigResult);

  // 导出记录
  let records = [];
  try {
    const outR = await cdp.send('Runtime.evaluate', {
      expression: `(function(){ return JSON.stringify(window.__pushRecords || []); })()`,
      returnByValue: true,
    });
    records = JSON.parse(outR.result.value || '[]');
  } catch (e) { console.log('导出失败:', e.message); }

  console.log('[5] 记录数:', records.length);
  const fname = path.join(OUT, 'plain24_birth_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(records, null, 2));
  console.log('  已保存:', fname);

  // 打印 24B 记录
  console.log('\n=== 24B 数组构造记录（含 plain24 特征）===');
  let printed = 0;
  records.forEach((r, i) => {
    const c = r.content;
    const isPlain24 = c.length === 24 && (c[16] === 183 || (c[20] === 127 && c[21] === 51));
    if (isPlain24 || printed < 8) {
      printed++;
      console.log(`\n[${i}] (${r.tag}) content: ${c.join(',')}`);
      console.log('  hex: ' + c.map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  stack:');
      console.log('  ' + r.stack.split('\n').slice(1, 10).join('\n  '));
    }
  });

  await browser.close().catch(() => {});
  process.exit(0);
}

// 总超时保护
const GLOBAL_TIMEOUT = setTimeout(() => {
  console.log('\n!!! 总超时 240s，强制退出');
  process.exit(2);
}, 240000);
GLOBAL_TIMEOUT.unref();

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
