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
    patchLoop: true,
    savePatched: true,
    debugLog: true,
  });
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'), env.sandbox, { timeout: 20000 });
    console.log('外层 VM 完成');
  } catch (e) {
    console.log('外层 VM:', e.message.substring(0, 60));
  }
  // 检查沙箱 $_ts 结构（动态代码 eval 前）
  try {
    const tsInfo = require('vm').runInContext('JSON.stringify({keys: Object.keys(\$_ts||{}), t0type: typeof (\$_ts&&\$_ts[0]), t0len: (\$_ts&&\$_ts[0]&&\$_ts[0].length), scj: typeof \$_ts.scj, aebi: typeof \$_ts.aebi})', env.sandbox);
    console.log('\$_ts 结构:', tsInfo);
  } catch (e) {
    console.log('\$_ts 读取失败:', e.message.substring(0, 50));
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
  console.log('cookies:', env.captured.cookies);
  console.log('errors:', env.captured.errors.slice(0, 5));
  if (env.captured.loopStack) {
    console.log('=== 错误堆栈（前 12 行）===');
    console.log(env.captured.loopStack.split('\n').slice(0, 12).join('\n'));
  }
  try {
    const dd = require('vm').runInContext('JSON.stringify({dynDone: window.__dynDone===true, w3: window.__w3||0, ne: window.__ne3, op204: window.__op204, g7seq: (window.__g7seq||[]).slice(0, 40), g7tail: (window.__g7seq||[]).slice(-10), fW0len: window.__fW0len, tk3: (window.__tk3||[]).slice(-20)})', env.sandbox);
    console.log('dispatcher#3 追踪:', dd);
    const envCheck = require('vm').runInContext('JSON.stringify({chrome: typeof chrome, webdriver: navigator.webdriver, pluginsLen: navigator.plugins.length, hwCon: navigator.hardwareConcurrency, lang: navigator.language, userAgent: navigator.userAgent.length})', env.sandbox);
    console.log('环境检查:', envCheck);
  } catch (e) {}
  try {
    const fw = require('vm').runInContext('JSON.stringify((window.__fW0||[]).slice(390,420))', env.sandbox);
    console.log('fW0[390-419]:', fw);
  } catch (e) {}
  console.log('errors:', env.captured.errors.slice(0, 5));
  try {
    const inst = require('vm').runInContext('JSON.stringify({inst: window.__inst, wh: window.__wh||0, rA: window.__rA, rB: window.__rB, rC: window.__rC, roKeys: window.__r522obj ? Object.keys(window.__r522obj) : []})', env.sandbox);
    console.log('当前实例/522状态:', inst);
  } catch (e) {}
  } catch (e) {
    console.log('无法读取追踪:', e.message.substring(0, 40));
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
