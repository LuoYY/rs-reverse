/**
 * 359_sandbox_keys2.js
 * 同 nsd：Node vm 沙箱（sandbox_keygen）跑内层动态代码 → 生成 cookie → 提取 keys2 → 对比浏览器
 * 验证：keys2 是否纯计算可复现（沙箱补环境后）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);

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
  // 浏览器采集
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  let nsd = null, cd = null, pCookie = '';
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
    if (pc) pCookie = pc.value;
    if (!ch1) { console.log('无挑战'); process.exit(1); }
    nsd = ch1.nsd; cd = ch1.cd;
    console.log('nsd=' + nsd + ' cdLen=' + cd.length + ' P len=' + pCookie.length);
    await context.close();
  } finally { await browser.close(); }

  // 浏览器 keys2
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

  // 沙箱跑同 nsd（nx 参数）
  const { genKeysViaSandbox } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  console.log('\n运行沙箱（nx, nsd=' + nsd + '）...');
  try {
    const r = await genKeysViaSandbox({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, timeout: 90000, waitMs: 20000 });
    console.log('沙箱 cookie 前 22:', (r.cookie || '').substring(0, 22), 'len:', (r.cookie || '').length);
    console.log('沙箱 keys16:', r.keys16 ? r.keys16.slice(0, 4).join(',') : '无');
    console.log('沙箱 keys17:', r.keys17 ? r.keys17.slice(0, 4).join(',') : '无');
    if (r.cookie) {
      // 从沙箱 cookie 提取 keys2（外层解密）
      const sc = r.cookie.startsWith('a') ? r.cookie.slice(1) : r.cookie;
      const sC = decodeB86(sc);
      if (sC) {
        const sArr = numarrAddTime([...K16], 0, 1 / 256)[0];
        const sDec = encryptMode2([...sC], sArr, 1);
        const sK2 = sDec.slice(15, 63);
        console.log('沙箱 keys2 前8:', sK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('  与浏览器相同:', sK2.every((v, i) => v === browserK2[i]));
      }
    }
    console.log('沙箱 meta:', JSON.stringify(r.meta).substring(0, 200));
  } catch (e) {
    console.log('沙箱失败:', e.message.substring(0, 150));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
