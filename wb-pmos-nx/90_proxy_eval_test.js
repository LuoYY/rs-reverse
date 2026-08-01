/**
 * 90_proxy_eval_test.js
 * Proxy eval 伪装原生 → 瑞数 eval 检测通过 → _$g7 变 true → 死循环解除
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

  const sandboxKeygen = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const env = sandboxKeygen.buildEnv({ nsd, cd }, {
    target: 'https://pmos.nx.sgcc.com.cn:10443/',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    timeout: 120000,
    debugLog: true,
  });
  console.log('nativeEval(Proxy):', env.captured.nativeEval);

  // 验证 eval 伪装
  try {
    const evT = vm.runInContext('Function.prototype.toString.call(eval)', env.sandbox);
    console.log('沙箱 eval toString:', evT);
    const evT2 = vm.runInContext('eval.toString()', env.sandbox);
    console.log('eval.toString():', evT2);
    const evF = vm.runInContext('eval("1+1")', env.sandbox);
    console.log('eval 功能:', evF);
  } catch (e) { console.log('eval 验证失败:', e.message.substring(0, 50)); }

  // 跑外层 VM（120s 长超时：判断是真死循环还是慢）
  const t0 = Date.now();
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'), env.sandbox, { timeout: 120000 });
    console.log('外层 VM 完成', Date.now() - t0, 'ms');
  } catch (e) {
    console.log('外层 VM 错误:', e.message.substring(0, 60), Date.now() - t0, 'ms');
  }

  // 等异步回调
  await new Promise(r => setTimeout(r, 5000));
  const dynCode = env.getDynCode();
  console.log('\ncookie:', env.captured.cookies.length ? env.captured.cookies[0].substring(0, 60) : 'null');
  console.log('cookies 数:', env.captured.cookies.length);
  console.log('dynCodeLen:', dynCode ? dynCode.length : 0);
  console.log('errors:', env.captured.errors.slice(0, 5));
  if (env.captured.loopStack) {
    console.log('\n=== 堆栈（前 10 行）===');
    console.log(env.captured.loopStack.split('\n').slice(0, 10).join('\n'));
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
