process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 20000));
  const info = await page.evaluate(() => {
    const out = { keys: Object.keys(window).filter(k => k.startsWith('_$')).slice(0, 50) };
    out.tsKeys = window.$_ts ? Object.keys(window.$_ts) : null;
    return out;
  });
  console.log('window _$ keys:', info.keys.join(','));
  console.log('$_ts keys:', info.tsKeys ? info.tsKeys.join(',') : 'null');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
