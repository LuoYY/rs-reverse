/**
 * 01_probe_challenge.js
 *
 * 新站点 pmos.nx.sgcc.com.cn:10443 首次探测：
 *   1. 拉挑战页 → nsd/cd/O cookie
 *   2. runOuterVM 沙箱执行新外层 JS → 提取动态代码 + cp3
 *   3. 记录 keynameNum / basestr / cookie 名
 *
 * 用法：node 01_probe_challenge.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '..', 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const OUT = path.join(__dirname, 'captures');

function httpGet(url, cookie) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'GET',
      rejectUnauthorized: false, headers: { 'User-Agent': UA, 'Accept': '*/*', ...(cookie ? { Cookie: cookie } : {}) },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  console.log('=== pmos.nx.sgcc.com.cn:10443 首次探测 ===\n');

  // 1. 拉挑战页
  const ch = await httpGet(TARGET);
  console.log('[1] GET / →', ch.status, 'len=' + ch.body.length);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('  无 $_ts，body 前 200:', ch.body.substring(0, 200)); return; }
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  console.log('  nsd=' + nsd + ' cdLen=' + cd.length + ' O=' + oCookie.substring(0, 30) + '...');
  console.log('  Set-Cookie 全部:', setCookies.join(' | '));

  // 2. 沙箱提取 cp3
  console.log('\n[2] runOuterVM 沙箱执行新外层 JS...');
  const outerJs = fs.readFileSync(OUTER_JS, 'utf8');
  const { runOuterVM } = require(path.join(__dirname, '..', 'extract_dyncode_20080.js'));
  const r = runOuterVM({ nsd, cd }, outerJs);
  console.log('  evals:', r.evals.length, ' 动态代码 len=' + r.dynLen + ' cp3=' + r.cp3);
  if (r.error) console.log('  沙箱错误:', r.error);
  if (r.cookies.length) console.log('  cookie 写入:', r.cookies.join(' | ').substring(0, 150));

  // 3. 保存动态代码
  if (r.dynCode) {
    fs.writeFileSync(path.join(OUT, 'dyn-code.js'), r.dynCode);
    console.log('\n[3] ✓ 动态代码已保存:', path.join(OUT, 'dyn-code.js'));
  }

  // 4. basestr 探测：从动态代码找编码表特征
  if (r.dynCode) {
    const basestrPatterns = [
      /["']([A-Za-z0-9_.+\-]{60,90})["']/g,
    ];
    const found = new Set();
    for (const re of basestrPatterns) {
      let x;
      while ((x = re.exec(r.dynCode)) !== null) {
        const s = x[1];
        if (s.length > 60 && /[A-Za-z]/.test(s)) found.add(s.substring(0, 100));
      }
    }
    console.log('\n[4] 动态代码中候选 basestr 字符串:');
    [...found].slice(0, 10).forEach(s => console.log('  ', JSON.stringify(s)));
  }

  // 5. cookie 名确认：O cookie 前缀
  const oName = oCookie.split('=')[0];
  console.log('\n[5] O cookie 名:', oName, '→ P 名应为', oName.replace(/O$/, 'P'));
  console.log('  keynameNum 候选: 1151');

  // 保存挑战信息
  fs.writeFileSync(path.join(OUT, 'challenge.json'), JSON.stringify({ capturedAt: Date.now(), nsd, cdLen: cd.length, oCookie, cp3: r.cp3, dynLen: r.dynLen }, null, 2));
  console.log('\n完成。captures/challenge.json 已保存');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
