/**
 * 88_jsdom_cookie_wide.js
 *
 * jsdom 生成 cookie（新 cd + O）→ 宽时间窗口反解 keys2（uuid 严格校验）
 * 对比浏览器 keys2（同 cd）——验证 jsdom keys2 是否纯计算
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { JSDOM } = require('jsdom');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://119.167.233.189:2018', username: '74940609', password: 'aFmWc5Fs' };
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

function httpGet(url) {
  return new Promise(r => {
    const req = https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA, 'Accept': '*/*' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', (e) => r({ status: 'ERR', body: '', headers: {} }));
    req.setTimeout(60000, () => { req.destroy(); r({ status: 'TIMEOUT', body: '', headers: {} }); });
  });
}
function decodeStr(s) {
  const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(s.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]], c3 = idxmap[s[qi + 3]]; qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < s.length) { const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]]; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  else if (qi + 1 < s.length) bytes.push((idxmap[s[qi]] << 2) | (idxmap[s[qi + 1]] >> 4));
  return bytes;
}

async function jsdomCookie(nsd, cd, oCookie) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  const cookies = [];
  let cj = oCookie;
  Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cookies.push(v); cj = cj ? cj + '; ' + v : v; }, configurable: true });
  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); await new Promise(r => setTimeout(r, 20000)); } catch (e) {}
  window.close();
  return cookies.map(c => c.split(';')[0]).find(c => /P=/.test(c)) || null;
}

async function browserKeys(browser, nsdCd) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  let challenge = null, oCookie = '';
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
  try { const cks = await context.cookies(); const oc = cks.find(c => c.name.endsWith('O')); if (oc) oCookie = oc.name + '=' + oc.value; } catch (e) {}
  // 数组陷阱
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){ var r=[]; window.__tr=r; var OP=Array.prototype.push; function rec(a){ if(r.length<200 && (a.length===16||a.length===48)){ var ok=true; for(var i=0;i<a.length;i++) if(typeof a[i]!=='number'){ok=false;break;} if(ok){ var c=[]; for(var j=0;j<a.length;j++)OP.call(c,a[j]); r.push(c);} } } var op=Array.prototype.push; Array.prototype.push=function(){ try{ var nl=this.length+arguments.length; if(nl===16||nl===48){ var c=[]; for(var i=0;i<this.length;i++)OP.call(c,this[i]); for(var j=0;j<arguments.length;j++)OP.call(c,arguments[j]); rec(c);} }catch(e){} return op.apply(this,arguments);}; var os=Array.prototype.slice; Array.prototype.slice=function(){ try{ var x=os.apply(this,arguments); if(x&&(x.length===16||x.length===48))rec(x); return x; }catch(e){return os.apply(this,arguments);} }; var oc=Array.prototype.concat; Array.prototype.concat=function(){ try{ var x=oc.apply(this,arguments); if(x&&(x.length===16||x.length===48))rec(x); return x; }catch(e){return oc.apply(this,arguments);} }; return 'ok'; })()`,
    returnByValue: true,
  });
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  const rr = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__tr||[])', returnByValue: true });
  let recs = []; try { recs = JSON.parse(rr.result.value); } catch (e) {}
  await context.close();
  const k48 = recs.filter(a => a.length === 48 && a.every(b => typeof b === 'number' && b >= 0 && b <= 255) && a.filter(b => b >= 32 && b <= 126).length < 48 * 0.4);
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  return { challenge, oCookie, keys2: dedup(k48)[0] || null };
}

(async () => {
  // 管线初始化（解密函数 + uuid）
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const br = await browserKeys(browser);
  await browser.close();
  if (!br.challenge || !br.keys2) { console.log('浏览器数据不完整'); process.exit(1); }
  const { nsd, cd } = br.challenge;
  console.log('浏览器 nsd:', nsd, 'keys2:', br.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // jsdom 同 cd 生成 cookie
  console.log('\njsdom 生成 cookie（同 cd）...');
  const pCookie = await jsdomCookie(nsd, cd, br.oCookie);
  if (!pCookie) { console.log('jsdom 未生成 P'); process.exit(1); }
  console.log('jsdom P cookie len:', pCookie.split('=')[1].length);
  const bytes = decodeStr(pCookie.split('=')[1].slice(1));

  // 宽窗口反解（±7200s × 256 ele）
  console.log('宽窗口反解 keys2（±7200s）...');
  const now = Math.floor(Date.now() / 1000);
  let found = null;
  for (let t = now - 7200; t <= now + 7200 && !found; t++) {
    for (let ele = 1; ele <= 256 && !found; ele++) {
      try {
        const arr = numarrAddTime([...K16], t, ele / 256)[0];
        const dec = encryptMode2([...bytes], arr, 1);
        if (dec.length > 50 && dec[4] === 4 && dec[14] === 48) {
          const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
          if (calc.every((b, i) => b === dec[i])) found = { t, ele, dec };
        }
      } catch (e) {}
    }
  }
  if (!found) { console.log('jsdom cookie 反解失败（uuid 无匹配）'); process.exit(1); }
  console.log('反解成功 t=' + found.t);
  const na = found.dec.slice(4);
  const jsKeys2 = na.slice(11, 59);
  console.log('jsdom keys2:', jsKeys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  const same = jsKeys2.length === br.keys2.length && jsKeys2.every((v, i) => v === br.keys2[i]);
  console.log('与浏览器 keys2 相同:', same ? '★★★ 突破! jsdom keys2 纯计算!' : 'NO');
  if (!same) {
    console.log('浏览器 keys2:', br.keys2.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('jsdom keys2 :', jsKeys2.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('XOR 前16:', jsKeys2.slice(0, 16).map((v, i) => v ^ br.keys2[i]).map(x => x.toString(16).padStart(2, '0')).join(' '));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
