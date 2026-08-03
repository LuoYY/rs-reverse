/**
 * 728_A9_debug_pk_dump.js
 * 直接 patch dynCode 的 opcode 90 分支：_$pk=_$jo(_$pI) → 记录 _$pI 类型 + _$jo 返回
 * 目的：确认属性名池 _$pk 从哪个环境对象构造
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js');
const NX_TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const NX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsd = +rawBody.match(/nsd=(\d+)/)[1];
  const cd = rawBody.match(/cd="([^"]+)"/)[1];

  let dynCode = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
  console.log('dynCode len:', dynCode.length);

  // patch opcode 90：记录 _$pI 和 _$jo 结果
  const patched = dynCode.replace('_$pk=_$jo(_$pI);', `(window.__pkdbg=window.__pkdbg||[]).push({type:typeof _$pI, isArr:Array.isArray(_$pI), len:(_$pI&&_$pI.length)||0, str:(typeof _$pI==='string')?_$pI.substring(0,300):null, keys:(typeof _$pI==='object'&&_$pI!==null)?Object.keys(_$pI).slice(0,50):null}); _$pk=_$jo(_$pI);`);
  console.log('patch 应用:', patched !== dynCode);
  fs.writeFileSync('/tmp/nx_app_dyn_pkdbg.js', patched);

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
    window.__all = 0;
  `, sb);
  try { vm.runInContext(patched, sb, { timeout: 40000, filename: 'appdyn.js' }); }
  catch (e) { console.log('运行异常:', e.message.substring(0, 120)); }
  await new Promise(r => setTimeout(r, 5000));
  try {
    const dbg = vm.runInContext('window.__pkdbg ? JSON.stringify(window.__pkdbg) : "no-dbg"', sb);
    console.log('\n=== _$pk 构造调试 ===');
    console.log(dbg.substring(0, 3000));
  } catch (e) { console.log('读 dbg 失败:', e.message.substring(0, 80)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
