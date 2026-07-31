/**
 * 17_trap_query_combined.js
 *
 * 同会话同时捕获：数组陷阱（keys16/keys2）+ query + challenge + cookie
 * 用于验证 管线 keys2 == 浏览器 keys2（session 段）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  let challenge = null;
  page.on('response', async (resp) => {
    if (resp.status() === 412 && !challenge) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenge = { nsd: nsdM ? +nsdM[1] : null, cd: cdM ? cdM[1] : null };
      } catch (e) {}
    }
  });

  console.log('加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);
  console.log('challenge:', challenge ? 'nsd=' + challenge.nsd : 'null');

  // 数组陷阱（只抓 16/48）
  console.log('注入数组陷阱...');
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      if (window.__trapHooked2) return 'already';
      var records = [];
      window.__trapRecords2 = records;
      var count = 0;
      var O_PUSH = Array.prototype.push;
      function record(tag, arr, stack) {
        if (count < 120) {
          count++;
          var allNum = true;
          for (var i = 0; i < Math.min(arr.length, 60); i++) if (typeof arr[i] !== 'number' || !isFinite(arr[i])) { allNum = false; break; }
          if (allNum) O_PUSH.call(records, { tag: tag, len: arr.length, content: arr.slice(0, 60), stack: stack.substring(0, 1000) });
        }
      }
      var origPush = Array.prototype.push;
      Array.prototype.push = function() {
        try {
          var nl = this.length + arguments.length;
          if (nl === 16 || nl === 48) {
            var content = [];
            for (var i = 0; i < this.length; i++) O_PUSH.call(content, this[i]);
            for (var j = 0; j < arguments.length; j++) O_PUSH.call(content, arguments[j]);
            record('push', content, (new Error()).stack);
          }
        } catch (e) {}
        return origPush.apply(this, arguments);
      };
      var origSlice = Array.prototype.slice;
      Array.prototype.slice = function() {
        try {
          var r = origSlice.apply(this, arguments);
          if (r && (r.length === 16 || r.length === 48)) record('slice', r, (new Error()).stack);
          return r;
        } catch (e) { return origSlice.apply(this, arguments); }
      };
      window.__trapHooked2 = true;
      return 'ok';
    })()`,
    returnByValue: true,
  });

  // 触发请求（同时记录 query）
  console.log('触发 POST...');
  const queries = [];
  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return JSON.stringify({status:x.status,url:x.responseURL})}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  let td;
  try { td = JSON.parse(trig.result.value); } catch (e) { td = { status: trig.result.value }; }
  console.log('  触发:', td.status);
  if (td.url) {
    const qm = td.url.match(/[?&]([^=]+)=([^&]+)/);
    if (qm) queries.push({ param: qm[1], query: decodeURIComponent(qm[2]) });
  }

  const recordsR = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__trapRecords2 || [])', returnByValue: true });
  const records = JSON.parse(recordsR.result.value);
  const cookies = await context.cookies();

  const out = { capturedAt: Date.now(), challenge, queries, records, cookies: cookies.map(c => ({ name: c.name, value: c.value })) };
  const fname = path.join(OUT, 'combined_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('已保存:', fname);
  console.log('records:', records.length);

  // 摘要
  console.log('\n=== 48 字节数组（keys2 候选）===');
  records.filter(r => r.len === 48).forEach((r, i) => {
    console.log('[' + i + '] (' + r.tag + ') ' + r.content.map(b => b.toString(16).padStart(2, '0')).join(' '));
  });
  console.log('\n=== 16 字节数组（keys16/17 候选）===');
  records.filter(r => r.len === 16).forEach((r, i) => {
    console.log('[' + i + '] (' + r.tag + ') ' + r.content.map(b => b.toString(16).padStart(2, '0')).join(' '));
  });

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
