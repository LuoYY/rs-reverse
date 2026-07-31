/**
 * 23_trap_basearr.js
 *
 * 抓取 basearr 明文（numarrEncrypt 前的数组）：
 *   - 长度 250-500
 *   - 头部特征：3,xx（numarrJoin 外层）或含 UA/platform 特征
 * 通过 hook 数组构造 + 调用栈过滤
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

  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);
  console.log('challenge nsd=' + (challenge ? challenge.nsd : 'null'));

  // 数组陷阱：抓 200-600 长度，避免 JSON（内容非 ASCII）
  console.log('注入数组陷阱...');
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      if (window.__trapBa) return 'already';
      var records = [];
      window.__trapBaRecords = records;
      var count = 0;
      var O_PUSH = Array.prototype.push;
      function copyArr(arr, max) {
        var c = [];
        var n = Math.min(arr.length, max || 400);
        for (var i = 0; i < n; i++) O_PUSH.call(c, arr[i]);
        return c;
      }
      function isJsonLike(arr) {
        var printable = 0;
        var n = Math.min(arr.length, 100);
        for (var i = 0; i < n; i++) {
          var b = arr[i];
          if (b >= 32 && b <= 126) printable++;
        }
        return printable / n > 0.5;
      }
      function record(tag, arr, stack) {
        if (count < 40) {
          count++;
          var allNum = true;
          for (var i = 0; i < Math.min(arr.length, 300); i++) if (typeof arr[i] !== 'number' || !isFinite(arr[i])) { allNum = false; break; }
          if (allNum && !isJsonLike(arr)) O_PUSH.call(records, { tag: tag, len: arr.length, content: copyArr(arr, 400), stack: stack.substring(0, 1500) });
        }
      }
      var origPush = Array.prototype.push;
      Array.prototype.push = function() {
        try {
          var nl = this.length + arguments.length;
          if (nl >= 150 && nl <= 600) {
            var content = copyArr(this);
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
          if (r && r.length >= 150 && r.length <= 600) record('slice', copyArr(r), (new Error()).stack);
          return r;
        } catch (e) { return origSlice.apply(this, arguments); }
      };
      window.__trapBa = true;
      return 'ok';
    })()`,
    returnByValue: true,
  });

  // 触发 cookie 生成
  console.log('触发请求...');
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  await page.waitForTimeout(2000);

  const recordsR = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__trapBaRecords || [])', returnByValue: true });
  const records = JSON.parse(recordsR.result.value);
  const cookies = await context.cookies();
  const out = { capturedAt: Date.now(), challenge, records, cookies: cookies.map(c => ({ name: c.name, value: c.value })) };
  const fname = path.join(OUT, 'basearr_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('记录:', records.length, '已保存:', fname);

  console.log('\n=== 大数组（basearr 候选）===');
  records.forEach((r, i) => {
    console.log('\n[' + i + '] (' + r.tag + ') len=' + r.len);
    console.log('  头 20:', r.content.slice(0, 20).join(','));
    console.log('  stack:', r.stack.split('\n').slice(1, 3).join('\n  '));
  });

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
