/**
 * 68_sandbox_inspect.js
 * 用 _debugProcess(SIGUSR1) 强制中断沙箱死循环，抓取真实 JS 堆栈
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const inspector = require('inspector');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const session = new inspector.Session();
session.connect();
session.post('Debugger.enable');

let got = false;
session.on('Debugger.paused', (msg) => {
  if (got) { session.post('Debugger.resume'); return; }
  got = true;
  console.log('\n=== JS 已暂停，调用栈（前 25 帧）===');
  const frames = (msg.params.callFrames || []).slice(0, 25);
  frames.forEach((f, i) => {
    const loc = f.location ? `${f.url}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}` : '?';
    console.log(`  [${i}] ${f.functionName || '(anonymous)'} @ ${loc}`);
  });
  setTimeout(() => process.exit(0), 300);
});

async function main() {
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;

  const sandboxKeygen = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const env = sandboxKeygen.buildEnv({ nsd, cd }, {
    target: 'https://pmos.nx.sgcc.com.cn:10443/',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    timeout: 30000,
  });
  // 6s 后 SIGUSR1 强制中断
  setTimeout(() => {
    console.log('>>> SIGUSR1 中断...');
    try { process._debugProcess(process.pid); } catch (e) { console.log('中断失败:', e.message); }
  }, 6000);
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'), env.proxied, { timeout: 30000 });
    console.log('外层 VM 完成');
    console.log('cookies:', env.captured.cookies.length, 'errors:', env.captured.errors.slice(0, 3));
  } catch (e) {
    console.log('外层 VM:', e.message.substring(0, 60));
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
