/**
 * 73_native_eval_test.js
 *
 * 验证假设：沙箱死循环 = 瑞数检测 eval 非原生
 * 用 vm 内建原生 eval（toString 为 native）执行外层 VM → 看是否不死循环 + 生成 cookie
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

async function main() {
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  console.log('nsd:', nsd);

  const sandboxKeygen = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const env = sandboxKeygen.buildEnv({ nsd, cd }, {
    target: 'https://pmos.nx.sgcc.com.cn:10443/',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    timeout: 15000,
    nativeEval: true,
    debugLog: true,
  });
  console.log('nativeEval:', env.captured.nativeEval);
  console.log('eval.toString:', vm.runInContext('eval.toString()', env.proxied, { timeout: 2000 }).substring(0, 60));

  const t0 = Date.now();
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'), env.proxied, { timeout: 15000 });
    console.log('外层 VM 完成', Date.now() - t0, 'ms');
  } catch (e) {
    console.log('外层 VM:', e.message.substring(0, 60), Date.now() - t0, 'ms');
  }
  console.log('cookies:', env.captured.cookies);
  console.log('errors:', env.captured.errors.slice(0, 5));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
