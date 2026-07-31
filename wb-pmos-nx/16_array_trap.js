/**
 * 16_array_trap.js
 *
 * 数组陷阱：hook Array.prototype.push/slice/concat/map
 * 抓 16/48 字节全数字数组 + 调用栈（定位 keys16/keys2）
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

  console.log('加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  // 注入数组陷阱（reload 后，只影响 query 阶段）
  console.log('注入数组陷阱...');
  const hookR = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      if (window.__trapHooked) return 'already';
      var records = [];
      window.__trapRecords = records;
      var count = 0;
      var O_PUSH = Array.prototype.push;
      var O_SLICE = Array.prototype.slice;
      function copyArr(arr) {
        var c = []; var n = Math.min(arr.length, 60);
        for (var i = 0; i < n; i++) O_PUSH.call(c, arr[i]);
        return c;
      }
      function record(tag, arr, stack) {
        if (count < 100) {
          count++;
          var allNum = arr.length > 0;
          for (var i = 0; i < Math.min(arr.length, 60); i++) if (typeof arr[i] !== 'number') { allNum = false; break; }
          if (allNum) O_PUSH.call(records, { tag: tag, len: arr.length, content: copyArr(arr), stack: stack.substring(0, 1200) });
        }
      }
      var origPush = Array.prototype.push;
      Array.prototype.push = function() {
        try {
          var nl = this.length + arguments.length;
          if (nl === 16 || nl === 48 || nl === 24) {
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
          if (r && (r.length === 16 || r.length === 48 || r.length === 24)) record('slice', r, (new Error()).stack);
          return r;
        } catch (e) { return origSlice.apply(this, arguments); }
      };
      var origConcat = Array.prototype.concat;
      Array.prototype.concat = function() {
        try {
          var r = origConcat.apply(this, arguments);
          if (r && (r.length === 16 || r.length === 48 || r.length === 24)) record('concat', r, (new Error()).stack);
          return r;
        } catch (e) { return origConcat.apply(this, arguments); }
      };
      var origMap = Array.prototype.map;
      Array.prototype.map = function() {
        try {
          var r = origMap.apply(this, arguments);
          if (r && (r.length === 16 || r.length === 48 || r.length === 24)) record('map', r, (new Error()).stack);
          return r;
        } catch (e) { return origMap.apply(this, arguments); }
      };
      window.__trapHooked = true;
      return 'ok';
    })()`,
    returnByValue: true,
  });
  console.log('  hook:', hookR.result.value);

  // 触发请求
  console.log('触发 POST...');
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });

  const recordsR = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__trapRecords || [])', returnByValue: true });
  const records = JSON.parse(recordsR.result.value);
  console.log('记录数:', records.length);

  // 按长度分组统计
  const byLen = {};
  records.forEach(r => { byLen[r.len] = (byLen[r.len] || 0) + 1; });
  console.log('长度分布:', JSON.stringify(byLen));

  // 找 keys16（16 字节，跨会话恒定 d7 5a 5c 72...）
  const keys16Known = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];
  console.log('\n=== 16 字节数组 ===');
  records.filter(r => r.len === 16).forEach((r, i) => {
    const hex = r.content.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const match = r.content.every((b, j) => b === keys16Known[j]);
    console.log('[' + i + '] (' + r.tag + ') ' + hex + (match ? ' ★keys16!' : ''));
    if (i < 3) console.log('    stack:', r.stack.split('\n').slice(1, 5).join('\n    '));
  });

  console.log('\n=== 48 字节数组 ===');
  records.filter(r => r.len === 48).slice(0, 6).forEach((r, i) => {
    console.log('[' + i + '] (' + r.tag + ') ' + r.content.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('    stack:', r.stack.split('\n').slice(1, 5).join('\n    '));
  });

  // 保存
  fs.writeFileSync(path.join(OUT, 'trap_' + Date.now() + '.json'), JSON.stringify(records, null, 2));
  console.log('\n已保存 captures/trap_*.json');

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
