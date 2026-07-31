/**
 * 67_save_dyn_sandbox.js
 * 沙箱提取 nx 动态代码并保存，供反检测点分析
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
  const sandboxKeygen = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const env = sandboxKeygen.buildEnv({ nsd, cd }, {
    target: 'https://pmos.nx.sgcc.com.cn:10443/',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    timeout: 3000,  // 短超时：只需要提取动态代码
  });
  try {
    require('vm').runInContext(fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'), env.proxied, { timeout: 3000 });
  } catch (e) {}
  const dyn = env.getDynCode();
  if (dyn) {
    const fname = path.join(OUT, 'sandbox_dyn_' + Date.now() + '.js');
    fs.writeFileSync(fname, dyn);
    console.log('已保存 nx 沙箱动态代码:', fname, dyn.length, 'chars');
  } else {
    console.log('未提取到动态代码');
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
