/**
 * 66_sandbox_debug.js
 * 调试 nx 沙箱外层 VM 超时：缩短 timeout，打印 missing/errors/执行进度
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

async function main() {
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  console.log('nsd:', nsd);

  const sandboxKeygen = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  // 用 runSandbox 拿 captured（含 missing/errors）
  const r = await sandboxKeygen.runSandbox({ nsd, cd }, {
    outerJsCode: fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'),
    target: 'https://pmos.nx.sgcc.com.cn:10443/',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    timeout: 10000,
    debugLog: true,
    waitMs: 20000,
  });
  console.log('cookie:', r.pCookie ? r.pCookie.substring(0, 30) : 'null');
  console.log('dynCodeLen:', r.dynCodeLen);
  console.log('errors:', r.errors.slice(0, 10));
  console.log('missing (前 40):', r.missing.slice(0, 40).join(', '));
  console.log('missing 总数:', r.missing.length);
  console.log('cookies:', r.cookies);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
