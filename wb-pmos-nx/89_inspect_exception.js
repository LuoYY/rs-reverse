/**
 * 89_inspect_exception.js
 * 捕获沙箱 documentMode 异常时的局部变量（精确定位 X 是谁）
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

  // inspector 监听异常暂停
  const session = new inspector.Session();
  session.connect();
  session.post('Debugger.enable');
  session.post('Debugger.setPauseOnExceptions', { state: 'uncaught' });
  let pausedDone = false;
  session.on('Debugger.paused', async (msg) => {
    if (pausedDone) { session.post('Debugger.resume'); return; }
    pausedDone = true;
    console.log('\n=== 异常暂停（reason: ' + msg.params.reason + '）===');
    const frames = (msg.params.callFrames || []).slice(0, 8);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const loc = f.location ? `${f.url}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}` : '?';
      console.log(`\n[${i}] ${f.functionName || '(anonymous)'} @ ${loc}`);
      // 读局部变量
      const scopeChain = f.scopeChain || [];
      for (const sc of scopeChain) {
        if (!sc.object || !sc.object.objectId) continue;
        try {
          const props = await session.post('Runtime.getProperties', { objectId: sc.object.objectId, ownProperties: true });
          const locals = (props.result || []).filter(p => p.name && p.name.startsWith('_$') || p.name === 'document' || p.name === 'navigator');
          for (const lv of locals.slice(0, 12)) {
            let v = String(lv.value?.value ?? lv.value?.description ?? '');
            v = v.substring(0, 60);
            console.log(`    ${lv.name} = ${v}`);
          }
        } catch (e) {}
      }
    }
    // 手动重放：把 documentMode 访问点找出来
    setTimeout(() => process.exit(0), 500);
  });

  const sandboxKeygen = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const env = sandboxKeygen.buildEnv({ nsd, cd }, {
    target: 'https://pmos.nx.sgcc.com.cn:10443/',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    timeout: 20000,
    patchDyn: true,
    savePatched: true,
  });
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'), env.sandbox, { timeout: 20000 });
    console.log('外层 VM 完成（无异常）');
  } catch (e) {
    console.log('外层 VM 错误:', e.message.substring(0, 60));
  }
  setTimeout(() => {
    console.log('\ncookie:', env.captured.cookies);
    console.log('errors:', env.captured.errors.slice(0, 3));
    process.exit(0);
  }, 5000);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
