// 包裹 while(3) 父函数（_$dT @167006），捕获完整栈
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const ts = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_ts_full2.json'), 'utf8'));
  let dynCode = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');

  dynCode = dynCode.replace(/!_\$lj\?_\$oL[+\-]=-?\d+:0;/g, '0;');
  dynCode = dynCode.replace(/_\$oL\+=-?\d+:0;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });
  dynCode = dynCode.replace(/_\$oL\+=-?\d+;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });
  dynCode = dynCode.split('_$lj= !_$c7[_$oP[75]];').join('_$lj=0;');

  // 找 while(3) 父函数：function _$dT(){return _$kZ(_$lC[139]);}var ... while(1){_$jc...
  // 这是 IIFE 顶层（不是函数），直接找 while(3) 前的代码
  // 简单方案：用 try-catch 包裹整个 IIFE 的执行（在 $_ts.scj,$_ts.aebi 调用处）
  // IIFE 调用：})($_ts.scj,$_ts.aebi);
  // 改为 try{...}catch
  const callPat = '})($_ts.scj,$_ts.aebi);';
  const callIdx = dynCode.lastIndexOf(callPat);
  console.log('[C3] IIFE 调用 @' + callIdx);
  if (callIdx >= 0) {
    // 找 IIFE 定义起点（最近的 (function 或 (f）
    // 简单：把整个 dynCode 用 try 包：在 IIFE 起点前加 try{
    // IIFE 起点：dynCode 开头 (function(_$$5,_$lP){
    const iifeStart = dynCode.indexOf('(function(_$$5,_$lP){');
    if (iifeStart === 0) {
      dynCode = 'try{' + dynCode.slice(0, callIdx) + '}catch(__e){window.__IIFE_ERR={msg:String(__e),stack:__e.stack};throw __e;}' + dynCode.slice(callIdx + callPat.length);
      console.log('[C3] IIFE try-catch 包裹');
    }
  }

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[C3] 执行完成');
  } catch (e) {
    console.log('[C3] 错误:', e.message);
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const err = q('typeof __IIFE_ERR!=="undefined"?__IIFE_ERR:null');
  if (err && typeof err === 'object') {
    console.log('[C3] 捕获错误:', err.msg);
    console.log('[C3] 栈:');
    (err.stack || '').split('\n').slice(0, 15).forEach(l => console.log('[C3]   ' + l.slice(0, 250)));
  } else {
    console.log('[C3] 无捕获', JSON.stringify(err));
  }
  process.exit(0);
})().catch(e => { console.error('[C3] FATAL:', e.message); process.exit(1); });
