// 方向 1：四浏览器对比——验证真实浏览器 basearr 头是否一直 179,0,127,12 还是各异。
// 用 patchright 驱动本机四浏览器（Chrome/Chromium/Firefox Reverse/Edge）采集 P cookie，
// 解出 basearr 头。代理走 pmos.nx 可访问代理。
// 仅分析/验证用，不参与生成链路。
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const { chromium, firefox } = require('patchright');

const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
// 本机可直连 pmos.nx（412 challenge），无需代理（代理反而被 WAF 拦成 403）
const PROXY = null;
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const OUT = '/tmp/nx_browser_basearr_cmp.json';

// 四浏览器配置：chromium 系用 channel 指定本机安装，firefox 用 patchright firefox
const BROWSERS = [
  { name: 'chrome', kind: 'chromium', channel: 'chrome' },
  { name: 'chromium', kind: 'chromium', channel: 'chromium' },
  { name: 'edge', kind: 'chromium', channel: 'msedge' },
  { name: 'firefox-reverse', kind: 'firefox' },
];

function dB64(s) { const m = {}; for (let i = 0; i < 64; i++)m[NX_BS[i]] = i; const o = []; let q = 0; for (let g = 0; g < Math.floor(s.length / 4); g++) { const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]]; q += 4; if (c0 === undefined) return null; o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3) } const r = s.length - q; if (r === 2) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4)); else if (r === 3) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4), ((m[s[q + 1]] & 15) << 4) | (m[s[q + 2]] >> 2)); return o }
function makeDk(bs) { return bs.split('').reduce((ans, key, idx) => { const c = key.charCodeAt(); ans[0][c] = idx << 2; ans[1][c] = idx >> 4; ans[2][c] = (idx & 15) << 4; ans[3][c] = idx >> 2; ans[4][c] = (idx & 3) << 6; ans[5][c] = idx; return ans }, [{}, {}, {}, {}, {}, { ...new Array(256).fill(-1) }]) }
function decryptCd(cd) { const dk = makeDk(NX_BS); const [d1, d2, d3, d4, d5, d6] = dk; const arr = []; for (let i = 0; i < cd.length; i += 4) { const one = cd[i].charCodeAt(); const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined; const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined; const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined; two !== undefined && arr.push(d1[one] | d2[two]); three !== undefined && arr.push(d3[two] | d4[three]); four !== undefined && arr.push(d5[three] | d6[four]) } return arr }
function gLG(n, idx) { const it = n[idx]; idx++; let l; if ((it & 128) === 0) l = it; else if ((it & 192) === 128) { l = ((it & 63) << 8) | n[idx]; idx++ } else if ((it & 224) === 192) { l = ((it & 31) << 16) | (n[idx] << 8) | n[idx + 1]; idx += 2 } else if ((it & 240) === 224) { l = ((it & 15) << 24) | (n[idx] << 16) | (n[idx + 1] << 8) | n[idx + 2]; idx += 3 } else if ((it & 248) === 240) { l = (n[idx] << 24) | (n[idx + 1] << 16) | (n[idx + 2] << 8) | n[idx + 3]; idx += 4 } else l = it; return [l, idx] }
function deriveKeys(cdArr) { const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); for (let k0 = 0; k0 <= 127; k0++)for (let k1 = 0; k1 <= 127; k1++) { const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48]; const ans = tail.map((b, i) => b ^ off[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; if (ans.some(v => v > 255)) continue; const keys = []; let op = 1, gap, ok = true; for (let i = 0; i < ans[0]; i++) { [gap, op] = gLG(ans, op); if (gap < 0 || op + gap > ans.length) { ok = false; break } keys.push(ans.slice(op, op + gap)); op += gap } if (!ok) continue; const k16 = keys[16]; if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) return { keys } } return null }
function getTree() { let a = []; for (let i = 1; i < 255; i++)a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) { if (it.total <= a[i].total) { a.splice(i, 0, it); return } } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const byLen = {}; let maxL = 0; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val }
function hdecRaw(enc) { const ans = []; let key = 0, val = 0; for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const m = byLen[val]; if (m && m[key] !== undefined) { ans.push(m[key]); key = 0; val = 0 } if (val > maxL) { key = 0; val = 0 } } } return ans }

async function collectBrowser(cfgB) {
  let browser;
  const launchOpts = {
    headless: false, // 有头模式（无头 HeadlessChrome 被瑞数指纹拒 403）
    args: ['--no-sandbox', '--ignore-certificate-errors', '--disable-blink-features=AutomationControlled'],
  };
  if (cfgB.kind === 'chromium') {
    launchOpts.channel = cfgB.channel;
    browser = await chromium.launch(launchOpts);
  } else {
    // patchright 缓存 firefox-1532 缺失，用本机 Firefox Reverse.app
    launchOpts.executablePath = '/Applications/Firefox Reverse.app/Contents/MacOS/firefox';
    browser = await firefox.launch(launchOpts);
  }
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  let ts = null;
  page.on('response', async resp => {
    try {
      if (resp.status() === 412 && !ts) {
        const t = await resp.text().catch(() => '');
        const m = t.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
        if (m) ts = { nsd: +m[1], cd: m[2] };
      }
    } catch (e) { }
  });
  await page.goto(TARGET, { waitUntil: 'load', timeout: 45000 }).catch(() => { });
  let realP = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const cs = await context.cookies();
    realP = cs.find(c => c.name.endsWith('P'));
    if (realP && realP.value.length > 300) break;
  }
  // 服务端校验
  let replay = null;
  if (realP) {
    const resp = await page.request.get(TARGET, { headers: { Cookie: `${realP.name}=${realP.value}` } }).catch(() => null);
    replay = resp ? resp.status() : null;
  }
  const ua = await page.evaluate(() => navigator.userAgent).catch(() => null);
  await browser.close();
  return { ts, realP: realP ? { name: realP.name, value: realP.value } : null, replay, ua };
}

function baseFromCookie(P, cd) {
  const der = deriveKeys(decryptCd(cd));
  if (!der) return { err: 'deriveKeys 失败' };
  const keys17 = der.keys[17], keys2 = der.keys[2];
  const k16a = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...dB64(P.slice(1))], k16a, 1);
  const na = dec.slice(4);
  const cookieK2 = na.slice(11, 59);
  const k2match = JSON.stringify(keys2) === JSON.stringify(cookieK2);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const k17a = numarrAddTime([...keys17], 0, 1 / 256)[0];
  const tmp = encryptMode2([...be], k17a, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  const base = hdecRaw(huff);
  return { base, k2match, beLen };
}

(async () => {
  console.log('[CMP] pid=%d 四浏览器 basearr 头对比', process.pid);
  const results = [];
  for (const cfgB of BROWSERS) {
    try {
      console.log(`\n[CMP] === ${cfgB.name} ===`);
      const b = await collectBrowser(cfgB);
      if (!b.realP) { console.log(`[CMP] ${cfgB.name}: 未抓到 P cookie`); results.push({ name: cfgB.name, err: 'no P' }); continue; }
      if (!b.ts) { console.log(`[CMP] ${cfgB.name}: 未抓到 cd`); results.push({ name: cfgB.name, err: 'no cd' }); continue; }
      const r = baseFromCookie(b.realP.value, b.ts.cd);
      if (r.err) { console.log(`[CMP] ${cfgB.name}: ${r.err}`); results.push({ name: cfgB.name, err: r.err }); continue; }
      const head = r.base.slice(0, 8).join(',');
      console.log(`[CMP] ${cfgB.name}: nsd=${b.ts.nsd} replay=${b.replay} base头=[${head}] k2match=${r.k2match} baseLen=${r.base.length}`);
      console.log(`[CMP] ${cfgB.name} UA: ${b.ua}`);
      results.push({ name: cfgB.name, nsd: b.ts.nsd, replay: b.replay, baseHead: r.base.slice(0, 22), baseLen: r.base.length, k2match: r.k2match, ua: b.ua });
    } catch (e) {
      console.log(`[CMP] ${cfgB.name}: ERR ${e.message}`);
      results.push({ name: cfgB.name, err: e.message });
    }
  }
  // 汇总 base 头
  console.log('\n[CMP] === base 头汇总 ===');
  const heads = {};
  for (const r of results) {
    if (r.baseHead) {
      const h = r.baseHead.slice(0, 4).join(',');
      heads[h] = heads[h] || [];
      heads[h].push(r.name);
      console.log(`[CMP] ${r.name}: 头=[${h}] replay=${r.replay}`);
    } else {
      console.log(`[CMP] ${r.name}: ${r.err || '无数据'}`);
    }
  }
  console.log('\n[CMP] 头分布: ' + JSON.stringify(Object.fromEntries(Object.entries(heads).map(([k, v]) => [k, v]))));
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log('[CMP] saved', OUT, 'done');
  process.exit(0);
})().catch(e => { console.error('[CMP] FATAL:', e && e.message); process.exit(1); });
