/**
 * 69_sandbox_patch.js
 * 打补丁定位沙箱死循环：_$ml 递归计数，ML_LOOP 抛错抓调用链
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
    timeout: 20000,
    patchDyn: true,
    debugLog: true,
  });
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'), env.sandbox, { timeout: 20000 });
    console.log('外层 VM 完成');
  } catch (e) {
    console.log('外层 VM:', e.message.substring(0, 60));
  }
  console.log('\ncookie:', env.captured.cookies.length ? env.captured.cookies[0].substring(0, 40) : 'null');
  console.log('errors:', env.captured.errors.slice(0, 5));
  if (env.captured.loopStack) {
    console.log('\n=== ML_LOOP 调用栈 ===');
    console.log(env.captured.loopStack.split('\n').slice(0, 25).join('\n'));
  }
  // 打印最后的子程序追踪（死循环位置）
  try {
    const tr = require('vm').runInContext('JSON.stringify((window.__tr||[]).slice(-25))', env.sandbox);
    console.log('\n最后 25 个子程序号:', tr);
    const tk = require('vm').runInContext('JSON.stringify(window.__tk||[])', env.sandbox);
    console.log('最后 opcode/PC:', tk);
    const meta = require('vm').runInContext('JSON.stringify({a812: window.__a812||0, ret812: window.__ret812, wh: window.__wh||0})', env.sandbox);
    console.log('812 信息:', meta);
  try {
    const inst = require('vm').runInContext('JSON.stringify({inst: window.__inst, wh: window.__wh||0, eoPc: window.__eoPc, eo: window.__eo})', env.sandbox);
    console.log('当前实例:', inst);
  } catch (e) {}
  } catch (e) {
    console.log('无法读取追踪:', e.message.substring(0, 40));
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
