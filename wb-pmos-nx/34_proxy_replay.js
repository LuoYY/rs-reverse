/**
 * 34_proxy_replay.js
 *
 * 通过代理重放浏览器原始 O+P（验证 IP 绑定假设）
 * 浏览器走代理 140.249.234.175:2022，Node 也走同一代理
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const PROXY = 'http://74940609:aFmWc5Fs@140.249.234.175:2022';

function httpGetProxy(url, cookieH) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const agent = new HttpsProxyAgent(PROXY);
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', rejectUnauthorized: false, agent,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0', ...(cookieH ? { Cookie: cookieH } : {}) },
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '' }));
    req.end();
  });
}

async function main() {
  // 读取 inner 捕获（最近会话的原始 O+P）
  const f = fs.readdirSync(OUT).filter(x => x.startsWith('inner_')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  const oc = d.cookies.find(c => c.name.endsWith('O'));
  const pc = d.cookies.find(c => c.name.endsWith('P'));
  console.log('文件:', f);

  // 1. 走代理拉挑战
  console.log('\n[1] 走代理拉挑战页...');
  const r0 = await httpGetProxy(TARGET);
  console.log('  挑战 →', r0.status, 'len=' + r0.body.length);
  const sc = [].concat(r0.headers['set-cookie'] || []);
  console.log('  Set-Cookie:', sc.join(' | ').substring(0, 120));

  // 2. 走代理重放浏览器原始 O+P
  console.log('\n[2] 代理重放浏览器原始 O+P...');
  const r1 = await httpGetProxy(TARGET, `${oc.name}=${oc.value}; ${pc.name}=${pc.value}`);
  console.log('  原始 O+P →', r1.status);

  // 3. 代理重放仅 P
  const r2 = await httpGetProxy(TARGET, `${pc.name}=${pc.value}`);
  console.log('  仅 P →', r2.status);

  // 4. 新挑战 O + 历史 P
  const newO = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  if (newO) {
    const r3 = await httpGetProxy(TARGET, `${newO}; ${pc.name}=${pc.value}`);
    console.log('  新O + 历史P →', r3.status);
  }

  // 5. 直连（无代理）拉挑战对比
  console.log('\n[3] 直连拉挑战...');
  const https2 = https;
  const r4 = await new Promise((resolve) => {
    const req = https2.get({ hostname: 'pmos.nx.sgcc.com.cn', port: 10443, path: '/', rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '' }));
  });
  console.log('  直连挑战 →', r4.status);
  const sc4 = [].concat(r4.headers['set-cookie'] || []);
  const newO4 = sc4.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  if (newO4) {
    const r5 = await httpGetProxy(TARGET, `${newO4}; ${pc.name}=${pc.value}`);
    console.log('  直连O + 历史P(代理重放) →', r5.status);
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
