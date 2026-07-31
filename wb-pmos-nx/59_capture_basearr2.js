/**
 * 59_capture_basearr2.js
 *
 * 抓第二个浏览器会话的 basearr（hook [185] 输入 → numenc → huffman 解码）
 * 对比 basearr303，分析固定/变化部分
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

// huffman 解码（nx getKey 不影响解码）
function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) {
      if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; }
    }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function decodeBits(bits) {
  const tree = getTree();
  const out = [];
  let node = tree;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    if (!node) break;
    if (node.idx !== undefined) { out.push(node.idx); node = tree; }
  }
  return out;
}

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
  console.log('challenge nsd:', challenge ? challenge.nsd : 'null');

  // 定位 global
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const dm = sendSrcR.result.value.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm[1];
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  let dId;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
  }
  const dProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dScopesId;
  for (const ip of (dProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dScopesId = ip.value.objectId; }
  const dScopes = await cdp.send('Runtime.getProperties', { objectId: dScopesId, ownProperties: true });
  let globalId = null;
  for (const scope of dScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (!v.value?.objectId) continue;
      if (v.value.description === 'Array(607)') {
        const chk = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function(){ return JSON.stringify({ t185: typeof this[185] }); }',
          returnByValue: true,
        });
        if (JSON.parse(chk.result.value).t185 === 'function') { globalId = v.value.objectId; break; }
      }
    }
    if (globalId) break;
  }
  if (!globalId) { console.log('未找到 global'); await browser.close(); return; }

  // hook [185] 抓内层输入 + [187] keys2
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self = this;
      var data = { innerInput: null, keys2: [] };
      function wrap(idx, onCall) {
        var orig = self[idx];
        if (typeof orig !== 'function') return;
        self[idx] = function() {
          var r = orig.apply(this, arguments);
          try { onCall(arguments); } catch(e) {}
          return r;
        };
      }
      wrap(185, function(a) { if (Array.isArray(a[0]) && a[0].length === 288 && Array.isArray(a[1]) && !data.innerInput) data.innerInput = a[0].slice(); });
      wrap(187, function(a) { if (Array.isArray(a[1]) && a[1].length === 48 && !data.keys2.length) data.keys2 = a[1].slice(); });
      self.__baData = data;
      return 'ok';
    }`,
    returnByValue: true,
  });

  await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  await page.waitForTimeout(1000);

  const dataR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__baData || {}); }', returnByValue: true });
  const data = JSON.parse(dataR.result.value);
  if (!data.innerInput) { console.log('未抓到 innerInput'); await browser.close(); return; }

  const keys2 = data.keys2;
  const numenc = data.innerInput.map((b, i) => i < 16 ? b ^ keys2[i] : b);
  // huffman 解码（完整 bit 流）
  let bits = '';
  for (const b of numenc) bits += b.toString(2).padStart(8, '0');
  const basearr = decodeBits(bits);
  console.log('basearr len:', basearr.length);

  const cookies = await context.cookies();
  const out = { capturedAt: Date.now(), challenge, basearr, keys2, cookies: cookies.map(c => ({ name: c.name, value: c.value })) };
  const fname = path.join(OUT, 'basearr_s2_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('已保存:', fname);

  // 对比 basearr303（第一个会话）
  const dec = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_decoded.json')));
  const ba1 = dec.basearr;
  console.log('\n=== basearr 对比（会话1 vs 会话2）===');
  console.log('len:', ba1.length, 'vs', basearr.length);
  const minLen = Math.min(ba1.length, basearr.length);
  let sameCount = 0;
  const diffs = [];
  for (let i = 0; i < minLen; i++) {
    if (ba1[i] === basearr[i]) sameCount++;
    else diffs.push(i);
  }
  console.log('相同字节:', sameCount, '/', minLen, '(', (sameCount / minLen * 100).toFixed(1), '%)');
  console.log('差异位置(前20):', diffs.slice(0, 20).join(','));
  // 差异区间
  if (diffs.length) {
    const ranges = [];
    let s = diffs[0], e = diffs[0];
    for (let i = 1; i < diffs.length; i++) {
      if (diffs[i] === e + 1) e = diffs[i];
      else { ranges.push([s, e]); s = e = diffs[i]; }
    }
    ranges.push([s, e]);
    console.log('差异区间:', ranges.slice(0, 10).map(r => r[0] + '-' + r[1]).join(', '));
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
