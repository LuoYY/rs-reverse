/**
 * 85_multi_cd_keys_capture.js
 *
 * 浏览器多会话采集 (cd, keys2, keys16, keys17, O) —— 分析 keys2 派生公式
 * keys2 = genKeys(cdArr XOR offset)，多会话反推 offset 模式
 * 采集用浏览器（一次性分析数据），最终生成算法纯 Node
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

async function main() {
  const n = parseInt(process.argv[2] || '5');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const sessions = [];
  try {
    for (let si = 0; si < n; si++) {
      console.log(`\n===== 会话 ${si} =====`);
      const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Runtime.enable');
      let challenge = null;
      let oCookie = '';
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
      // O cookie
      try {
        const cks = await context.cookies();
        const oc = cks.find(c => c.name.endsWith('O'));
        if (oc) oCookie = oc.name + '=' + oc.value;
      } catch (e) {}
      if (!challenge) { console.log('无 challenge'); await context.close(); continue; }

      // reload 后数组陷阱（16/48 字节）
      await cdp.send('Runtime.evaluate', {
        expression: `(function(){
          var records = []; window.__tr = records;
          var O_PUSH = Array.prototype.push;
          function copyArr(arr) { var c = []; for (var i = 0; i < Math.min(arr.length, 60); i++) O_PUSH.call(c, arr[i]); return c; }
          function record(arr) { if (records.length < 300 && (arr.length === 16 || arr.length === 48)) { var ok = arr.length > 0; for (var i = 0; i < arr.length; i++) if (typeof arr[i] !== 'number') { ok = false; break; } if (ok) records.push(copyArr(arr)); } }
          var op = Array.prototype.push;
          Array.prototype.push = function() { try { var nl = this.length + arguments.length; if (nl === 16 || nl === 48) { var c = []; for (var i = 0; i < this.length; i++) O_PUSH.call(c, this[i]); for (var j = 0; j < arguments.length; j++) O_PUSH.call(c, arguments[j]); record(c); } } catch(e) {} return op.apply(this, arguments); };
          var os = Array.prototype.slice;
          Array.prototype.slice = function() { try { var r = os.apply(this, arguments); if (r && (r.length === 16 || r.length === 48)) record(r); return r; } catch(e) { return os.apply(this, arguments); } };
          var oc = Array.prototype.concat;
          Array.prototype.concat = function() { try { var r = oc.apply(this, arguments); if (r && (r.length === 16 || r.length === 48)) record(r); return r; } catch(e) { return oc.apply(this, arguments); } };
          var om = Array.prototype.map;
          Array.prototype.map = function() { try { var r = om.apply(this, arguments); if (r && (r.length === 16 || r.length === 48)) record(r); return r; } catch(e) { return om.apply(this, arguments); } };
          return 'ok';
        })()`,
        returnByValue: true,
      });
      await cdp.send('Runtime.evaluate', {
        expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
        returnByValue: true,
      });
      const recsR = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__tr || [])', returnByValue: true });
      let recs = [];
      try { recs = JSON.parse(recsR.result.value); } catch (e) {}
      await context.close();

      // 识别 keys
      const k16s = [], k17s = [], k48s = [];
      for (const a of recs) {
        if (a.length === 16) {
          if (a.every((b, i) => b === K16[i])) k16s.push(a);
          else if (a[8] >= 128 && a[12] >= 2 && a[12] <= 5 && a[14] >= 4 && a[14] <= 7 && a[15] >= 2 && a[15] <= 7) k17s.push(a);
        } else if (a.length === 48) k48s.push(a);
      }
      const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
      const keys2 = dedup(k48s.filter(a => a.every(b => typeof b === 'number' && b >= 0 && b <= 255) && a.filter(b => b >= 32 && b <= 126).length < a.length * 0.4))[0] || null;
      const keys17 = dedup(k17s)[0] || null;
      const keys16 = dedup(k16s)[0] || null;
      console.log('nsd:', challenge.nsd, 'keys16:', keys16 ? keys16.slice(0, 4).map(b => b.toString(16)).join(' ') : '无', 'keys2:', keys2 ? keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
      if (keys2) {
        sessions.push({ nsd: challenge.nsd, cd: challenge.cd, oCookie, keys16, keys17, keys2 });
      }
    }
  } finally { await browser.close(); }
  const fname = path.join(OUT, 'multi_cd_keys_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(sessions, null, 2));
  console.log('\n已保存:', fname, '有效会话:', sessions.length);
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
