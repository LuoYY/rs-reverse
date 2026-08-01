/**
 * 91_proxy_inspect.js
 * Proxy eval 伪装原生 + inspector SIGUSR1 中断 → 定位剩余死循环位置
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const inspector = require('inspector');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

async function main() {
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;

  // inspector 中断监听
  const session = new inspector.Session();
  session.connect();
  session.post('Debugger.enable');
  let captured = false;
  session.on('Debugger.paused', async (msg) => {
    // 跳过 293 个 debugger 语句暂停，只抓 SIGUSR1 中断
    if (msg.params.reason === 'debuggerStatement') { session.post('Debugger.resume'); return; }
    if (captured) { session.post('Debugger.resume'); return; }
    captured = true;
    console.log('\n=== 中断暂停 (reason: ' + msg.params.reason + ') ===');
    const frames = (msg.params.callFrames || []).slice(0, 12);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const loc = f.location ? `${f.url || '(vm)'}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}` : '?';
      console.log(`  [${i}] ${f.functionName || '(anonymous)'} @ ${loc}`);
    }
    setTimeout(() => process.exit(0), 300);
  });
  // 6s 后 SIGUSR1 中断
  setTimeout(() => {
    try { process._debugProcess(process.pid); } catch (e) {}
  }, 6000);

  const sandboxKeygen = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const env = sandboxKeygen.buildEnv({ nsd, cd }, {
    target: 'https://pmos.nx.sgcc.com.cn:10443/',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    timeout: 20000,
    patchDyn: true,
    splitCodeFile: process.env.SPLIT_FILE || undefined,
  });
  console.log('Proxy eval:', env.captured.nativeEval);
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'), env.sandbox, { timeout: 20000 });
    console.log('外层 VM 完成（无超时）');
  } catch (e) {
    console.log('外层 VM:', e.message.substring(0, 60));
  }
  // 等中断处理
  setTimeout(() => {
    console.log('\ncookie:', env.captured.cookies);
    console.log('dynCodeLen:', env.getDynCode() ? env.getDynCode().length : 0);
    console.log('errors:', env.captured.errors.slice(0, 3));
    process.exit(0);
  }, 12000);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
