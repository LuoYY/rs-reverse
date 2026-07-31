/**
 * 33_compare_replay.js
 *
 * 对照实验：
 *   1. 浏览器原始 O+P 重放（排除 O 过期）
 *   2. 浏览器 O + 我构造的 P 重放
 *   3. 不同 O 组合测试
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';

function httpGet(url, cookieH) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', rejectUnauthorized: false,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0', ...(cookieH ? { Cookie: cookieH } : {}) },
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '' }));
    req.end();
  });
}

async function main() {
  // 读取所有捕获的 cookies（多个会话的 O+P）
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('inner_') || f.startsWith('full_') || f.startsWith('combined_') || f.startsWith('enc_'));
  console.log('捕获文件:', files.length);
  const pairs = [];
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
      const oc = d.cookies && d.cookies.find(c => c.name.endsWith('O'));
      const pc = d.cookies && d.cookies.find(c => c.name.endsWith('P'));
      if (oc && pc) pairs.push({ f, o: oc.value, p: pc.value, pName: pc.name, oName: oc.name, capturedAt: d.capturedAt });
    } catch (e) {}
  }
  console.log('O+P 配对:', pairs.length);

  // 每个配对测试：原始 P + 交换 O
  const now = Date.now();
  for (const pr of pairs) {
    const ageMin = Math.round((now - pr.capturedAt) / 60000);
    console.log(`\n=== ${pr.f} (捕获于 ${ageMin} 分钟前) ===`);
    // 原始 O+P
    const r1 = await httpGet(TARGET, `${pr.oName}=${pr.o}; ${pr.pName}=${pr.p}`);
    console.log('  原始 O+P →', r1.status);
    // 仅 P
    const r2 = await httpGet(TARGET, `${pr.pName}=${pr.p}`);
    console.log('  仅 P →', r2.status);
    // 交换 O（用另一配对的 O）
    if (pairs.length > 1) {
      const other = pairs.find(x => x !== pr);
      const r3 = await httpGet(TARGET, `${other.oName}=${other.o}; ${pr.pName}=${pr.p}`);
      console.log('  其他 O + 此 P →', r3.status);
    }
  }

  // 拉新挑战 → 新 O → 用历史 P 重放
  console.log('\n=== 新挑战测试 ===');
  const r4 = await httpGet(TARGET, '');
  const setCookies = [].concat(r4.headers['set-cookie'] || []);
  const newO = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  console.log('新 O:', newO.substring(0, 20) + '...');
  if (newO) {
    const [oName, oVal] = newO.split('=');
    for (const pr of pairs) {
      const r5 = await httpGet(TARGET, `${oName}=${oVal}; ${pr.pName}=${pr.p}`);
      console.log(`  新O + ${pr.f}的P →`, r5.status);
    }
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
