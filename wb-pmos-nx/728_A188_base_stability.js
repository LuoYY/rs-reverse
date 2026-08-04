/**
 * 728_A188_base_stability.js
 * 同 nsd 多次运行：对比 base 各段稳定性（哪些固定/随运行变）
 * 用浏览器 route 拦截（固定 nsd=67402）多次加载，提取 base 对比
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';
const MOCK_DIR = '/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock';

function decodeB86(str) {
  const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
  const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
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

async function loadOnce(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const raw = fs.readFileSync(path.join(MOCK_DIR, '412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  await page.route('**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    try {
      if (pathname === '/') {
        await route.fulfill({ status: 412, contentType: 'text/html;charset=utf-8', body: rawBody });
        return;
      }
      const file = path.join(MOCK_DIR, pathname);
      if (fs.existsSync(file)) {
        await route.fulfill({ status: 200, contentType: pathname.endsWith('.js') ? 'application/javascript' : 'text/plain', body: fs.readFileSync(file, 'utf8') });
        return;
      }
    } catch (e) {}
    await route.continue().catch(() => {});
  });
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 30000));
  const ck = await context.cookies();
  const p = ck.find(c => /P$/.test(c.name));
  await context.close();
  return p ? p.value : null;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: PROXY },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const bases = [];
  for (let i = 0; i < 4; i++) {
    const p = await loadOnce(browser);
    if (!p) { console.log(`运行${i}: 无 P cookie`); continue; }
    // 解码 base（简化：从 cookie 提取 be 段原始，不做完整解密——用 be 作为"准 base"对比稳定性）
    const b86 = decodeB86(p.slice(1));
    console.log(`运行${i}: P len=${p.length} b86 len=${b86 ? b86.length : '?'}`);
    bases.push(b86);
  }
  await browser.close();

  if (bases.length >= 2) {
    // 逐字节对比稳定性
    const len = Math.min(...bases.map(b => b.length));
    console.log('\n=== b86 稳定性（min len', len + '）===');
    const fixed = [], vary = [];
    for (let i = 0; i < len; i++) {
      const vals = new Set(bases.map(b => b[i]));
      if (vals.size === 1) fixed.push(i);
      else vary.push(i);
    }
    console.log('固定位置数:', fixed.length, '前 40:', fixed.slice(0, 40).join(','));
    console.log('变化位置数:', vary.length, '前 30:', vary.slice(0, 30).join(','));
    // 变化位置的值
    for (const i of vary.slice(0, 10)) {
      console.log(`位置 ${i}: ${bases.map(b => b[i]).join(', ')}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
