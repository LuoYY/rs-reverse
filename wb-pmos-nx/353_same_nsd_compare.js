/**
 * 353_same_nsd_compare.js
 * 决定性：同 nsd 下对比 浏览器 keys2（P cookie 解密） vs 管线 keys2（Coder/deriveKeys）
 * 若相同 → keys2 纯算法可行（352 号 412 是别的问题）；若不同 → keys2 环境相关
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const PROXY = 'http://74940609:aFmWc5Fs@39.91.164.125:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);

function makeDecryptKeys(bs) {
  return bs.split('').reduce((ans, key, idx) => {
    const code = key.charCodeAt();
    ans[0][code] = idx << 2; ans[1][code] = idx >> 4;
    ans[2][code] = (idx & 15) << 4; ans[3][code] = idx >> 2;
    ans[4][code] = (idx & 3) << 6; ans[5][code] = idx;
    return ans;
  }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
}
function decryptCdStr(cd) {
  const dk = makeDecryptKeys(NX_BS);
  const [d1, d2, d3, d4, d5, d6] = dk;
  const arr = [];
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && arr.push(d1[one] | d2[two]);
    three !== undefined && arr.push(d3[two] | d4[three]);
    four !== undefined && arr.push(d5[three] | d6[four]);
  }
  return arr;
}
function getLensGo(numarr, idx) {
  const item = numarr[idx]; idx++;
  let lens;
  if ((item & 128) === 0) lens = item;
  else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
  else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
  else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
  else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
  else lens = item;
  return [lens, idx];
}
function deriveOffset(tail) {
  try {
    const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
    for (let k0 = 0; k0 <= 127; k0++) {
      const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
      for (let k1 = 0; k1 <= 127; k1++) {
        const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
        const offset = [off0, off1, off2, off3, off4, off5, off6, off7];
        const ans = tail.map((b, i) => b ^ offset[i % 8]);
        if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
        const keys = [];
        let op = 1, gap, ok = true;
        for (let i = 0; i < ans[0]; i++) {
          [gap, op] = getLensGo(ans, op);
          if (gap < 0 || op + gap > ans.length) { ok = false; break; }
          keys.push(ans.slice(op, op + gap));
          op += gap;
        }
        if (!ok) continue;
        if (keys[16] && keys[16].length === 16 && keys[16].every((v, i) => v === K16[i])) return { offset, keys };
      }
    }
  } catch (e) {}
  return null;
}
function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < B86_64.length; i++) idxmap[B86_64[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

(async () => {
  // ===== 浏览器采集（拿 nsd/cd/P）=====
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  let nsd = null, cd = null, pCookie = '', pName = '';
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: { server: 'http://39.91.164.125:2018', username: '74940609', password: 'aFmWc5Fs' } });
    const page = await context.newPage();
    let ch1 = null;
    page.on('response', async (resp) => {
      if (resp.status() === 412 && !ch1) {
        try {
          const body = await resp.text();
          const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
          const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
          if (nsdM && cdM) ch1 = { nsd: +nsdM[1], cd: cdM[1] };
        } catch (e) {}
      }
    });
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(8000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(20000);
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    if (pc) { pCookie = pc.value; pName = pc.name; }
    if (!ch1) { console.log('浏览器未捕获挑战'); process.exit(1); }
    nsd = ch1.nsd; cd = ch1.cd;
    console.log('浏览器 nsd=' + nsd + ' cdLen=' + cd.length + ' P len=' + pCookie.length);
    await context.close();
  } finally { await browser.close(); }

  // 浏览器 keys2（P cookie 解密）
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const C = decodeB86(pCookie.slice(1));
  const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...C], arr, 1);
  const browserK2 = dec.slice(15, 63);
  console.log('浏览器 keys2:', browserK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // ===== 管线跑同 nsd =====
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  console.log('cp3:', r.cp3);
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);

  const cdArr = decryptCdStr(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const d = deriveOffset(cdArr.slice(end));
  console.log('offset 推导:', d ? 'OK' : '失败');

  // 方式1：管线 Coder
  try {
    const Coder = require('@src/handler/Coder');
    const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
    coder.run();
    const pipeK2 = gv.keys && gv.keys[2];
    console.log('管线 gv.keys[2]:', pipeK2 ? pipeK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
    if (pipeK2 && pipeK2.length === 48) {
      console.log('  与浏览器相同:', pipeK2.every((v, i) => v === browserK2[i]));
    }
  } catch (e) { console.log('Coder.run:', e.message.substring(0, 80)); }

  // 方式2：deriveOffset 简化
  if (d) {
    const derK2 = d.keys[2];
    console.log('deriveKeys keys[2]:', derK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('  与浏览器相同:', derK2.every((v, i) => v === browserK2[i]));
    console.log('  der.keys17:', d.keys[17].slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
    // 也对比 keys17
    const gvK17 = gv.keys && gv.keys[17];
    if (gvK17) console.log('  gv.keys17 与 der 相同:', gvK17.every((v, i) => v === d.keys[17][i]));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
