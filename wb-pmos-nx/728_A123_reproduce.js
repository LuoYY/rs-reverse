/**
 * 728_A123_reproduce.js
 * ★ 可复现脚本：Node vm 沙箱跑 nx 应用 js dynCode（basearr 生成）攻坚记录
 *
 * 【核心结论】
 * 1. aebi（bytecode 池）由【挑战 js】外层 VM 生成（648,2553,2479,431,38,7），
 *    与浏览器权威 $_ts.aebi 完全一致。直接跑应用 js 会重新生成错误 aebi（563,1769,2296,378,36,7）。
 * 2. 应用 dynCode（386788 字节，nsd=67402 混淆名）与浏览器逐字节一致（jsdom 也一致）。
 * 3. 卡点：dynCode 内 6 个 dispatcher（_\$_s[0..5] 对应 aebi 6 组），IIFE 顶层直接执行 _\$_s[3]。
 *    外层 dispatcher 的 _\$lf 寄存器数组 + 8 个属性名池（_\$eF/_\$kd/_\$oV/_\$nL/_\$bu/_\$dn/_\$iQ/_\$l5）
 *    未初始化导致报错（reading '27'/'38'/onicecandidate/audio 逐层推进）。
 * 4. 属性名池需浏览器权威注入（196 元素字符串池），_\$_1 需 Proxy 兜底 window 属性缺失。
 * 5. 最终卡点：外层 dispatcher 寄存器变量（_\$l6 等）未赋值——执行流依赖环境检测（_\$ib 标志），
 *    沙箱环境检测与浏览器不同 → 跳转不同 → 未初始化就访问。
 *
 * 【运行】cd /Users/luoyy/work/github/GitHub/rs-reverse_glm && nvm use 22.22.0 && node wb-pmos-nx/728_A123_reproduce.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CHALLENGE_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const APP_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js');
const NX_TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const NX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function loadTs() {
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsd = +rawBody.match(/nsd=(\d+)/)[1];
  const cd = rawBody.match(/cd="([^"]+)"/)[1];
  return { nsd, cd };
}

async function main() {
  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const { nsd, cd } = loadTs();
  const samples = JSON.parse(fs.readFileSync('/tmp/nx_multi_nsd3.json', 'utf8'));
  const target = samples.find(s => s.src === 'mock');
  console.log('目标 basearr[25-28]:', target.basearr.slice(25, 29).join(','));

  // ===== 步骤 1：挑战 js → $_ts（aebi 与浏览器一致 648,2553,2479,431,38,7）=====
  const env0 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env0.sandbox);
  try { vm.runInContext(fs.readFileSync(CHALLENGE_JS, 'utf8'), env0.sandbox, { timeout: 25000, filename: 'challenge.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  let tsData = 'null';
  try {
    const tsStr = vm.runInContext('typeof $_ts !== "undefined" ? JSON.stringify($_ts) : "null"', env0.sandbox);
    const td = JSON.parse(tsStr);
    if (td.aebi && Array.isArray(td.aebi)) {
      for (let i = 0; i < td.aebi.length; i++) {
        if (td.aebi[i] === undefined || td.aebi[i] === null) td.aebi[i] = [];
        else if (!Array.isArray(td.aebi[i])) td.aebi[i] = [td.aebi[i]];
      }
    }
    console.log('挑战 $_ts aebi:', (td.aebi || []).map(g => (g || []).length).join(','));
    console.log('挑战 $_ts keys:', Object.keys(td).join(','));
    tsData = JSON.stringify(td);
  } catch (e) { console.log('提取 $_ts 失败:', e.message.substring(0, 80)); }

  // ===== 步骤 2：应用 js → dynCode =====
  const env1 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env1.sandbox);
  try { vm.runInContext(fs.readFileSync(APP_JS, 'utf8'), env1.sandbox, { timeout: 30000, filename: 'app.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  const dynCode = env1.getDynCode() || fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
  console.log('应用 dynCode len:', dynCode.length);
  fs.writeFileSync('/tmp/nx_appjs_dyn_repro.js', dynCode);

  // ===== 步骤 3：跑应用 dynCode（正确 aebi + 属性名池注入 + _\$_1 Proxy）=====
  console.log('\n=== 跑应用 dynCode（正确 aebi）===');
  const env = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  const sb = env.sandbox;
  vm.runInContext(`
    if (typeof DataView !== 'undefined' && !DataView.prototype.getFloat16) {
      DataView.prototype.getFloat16 = function(byteOffset, littleEndian) {
        var u = this.getUint16(byteOffset, littleEndian);
        var sign = (u & 0x8000) ? -1 : 1;
        var exp = (u & 0x7c00) >> 10;
        var frac = u & 0x03ff;
        if (exp === 0) return sign * frac * Math.pow(2, -24);
        if (exp === 0x1f) return frac ? NaN : sign * Infinity;
        return sign * (1 + frac / 1024) * Math.pow(2, exp - 15);
      };
      DataView.prototype.setFloat16 = function(byteOffset, value, littleEndian) { this.setUint16(byteOffset, 0, littleEndian); };
    }
    window.DataView = DataView;
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
    window.__basearrs = [];
    var _origPush = Array.prototype.push;
    Array.prototype.push = function() {
      var r = _origPush.apply(this, arguments);
      if (Array.isArray(this) && this.length >= 130 && this.length <= 155 && this.every(function(x){return typeof x === 'number' && x >= 0 && x < 256;})) {
        var arr = Array.from(this);
        if (!window.__basearrs.some(function(b){return b.length === arr.length && JSON.stringify(b) === JSON.stringify(arr);})) {
          window.__basearrs.push(arr);
        }
      }
      return r;
    };
    window.__all = 0;
  `, sb);
  try { vm.runInContext('window.$_ts = ' + tsData + ';', sb); } catch (e) { console.log('注入 $_ts 失败:', e.message.substring(0, 60)); }

  console.log('[跑] 无补丁（正确 aebi）...');
  const t0 = Date.now();
  try { vm.runInContext(dynCode, sb, { timeout: 45000, filename: 'appdyn.js' }); }
  catch (e) { console.log('  报错:', e.message.substring(0, 80), '耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's'); }
  await new Promise(r => setTimeout(r, 5000));

  const basearrs = sb.window.__basearrs || [];
  console.log('捕获 basearr 数:', basearrs.length);
  if (basearrs.length) {
    const j = basearrs[basearrs.length - 1];
    console.log('vm basearr[0-31]:', j.slice(0, 32).join(','));
    console.log('vm basearr[25-28]:', j.slice(25, 29).join(','));
    console.log('浏览器 len:', target.basearr.length, 'vm len:', j.length);
    const diffs = [];
    for (let i = 0; i < Math.min(target.basearr.length, j.length); i++) {
      if (target.basearr[i] !== j[i]) diffs.push(`${i}:${target.basearr[i]}→${j[i]}`);
    }
    console.log('差异:', diffs.length, diffs.length ? diffs.slice(0, 40).join(' ') : '★★★ 完全一致！');
    fs.writeFileSync('/tmp/nx_vm_basearr_repro.json', JSON.stringify(j));
  } else {
    console.log('\n[卡点] basearr 未生成。报错链（逐层推进）:');
    console.log('  1. reading 27  → _\$lf 未初始化（dispatcher 寄存器数组）');
    console.log('  2. reading 38  → 属性名池 _\$oV 未初始化');
    console.log('  3. onicecandidate → _\$_1（window）缺 WebRTC 属性');
    console.log('  4. audio       → 外层 dispatcher 寄存器 _\$l6 未赋值（执行流依赖环境检测 _\$ib）');
    console.log('\n[结论] 应用 dynCode 执行流依赖环境检测值（_\$ib 等标志），沙箱环境检测与浏览器不同导致');
    console.log('  未初始化寄存器被访问。需精确复现浏览器执行流（完整环境模拟）或反编译 VM 逻辑。');
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
