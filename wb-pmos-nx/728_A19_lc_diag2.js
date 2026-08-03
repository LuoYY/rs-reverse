/**
 * 728_A19_lc_diag2.js
 * 用逗号表达式插桩报错点（兼容三元表达式）：
 * _$lc=_$lc[_$$M],_$ms=_$lc(_$eZ[_$ms]) → 记录 _$lc 类型/值后调用
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

  const env0 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env0.sandbox);
  const appJs = fs.readFileSync(APP_JS, 'utf8');
  try { vm.runInContext(appJs, env0.sandbox, { timeout: 30000, filename: 'app.js' }); } catch (e) {}
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
    tsData = JSON.stringify(td);
  } catch (e) {}

  let dynCode = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
  // 报错点（opcode 5 分支）：_$lc=_$lc[_$$M],_$ms=_$lc(_$eZ[_$ms])
  // 用逗号表达式替换，不破坏三元结构
  const target = `_$lc=_$lc[_$$M],_$ms=_$lc(_$eZ[_$ms])`;
  const repl = `(window.__lcd=window.__lcd||[],window.__lcd.push(typeof _$lc+":"+String(_$lc).substring(0,40)+"|M:"+String(_$$M).substring(0,30)),window.__lcd.length>80&&window.__lcd.shift(),_$lc=_$lc[_$$M],_$ms=(typeof _$lc==='function'?_$lc(_$eZ[_$ms]):__proxy()))`;
  const patched = dynCode.split(target).join(repl);
  console.log('插桩:', patched !== dynCode);
  fs.writeFileSync('/tmp/nx_app_dyn_lcdiag2.js', patched);

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
  try { vm.runInContext('window.$_ts = ' + tsData + ';', sb); } catch (e) {}
  try { vm.runInContext(patched, sb, { timeout: 40000, filename: 'appdyn.js' }); }
  catch (e) { console.log('运行异常:', e.message.substring(0, 120)); }
  await new Promise(r => setTimeout(r, 5000));
  try {
    const d = vm.runInContext('window.__lcd ? JSON.stringify(window.__lcd) : "no"', sb);
    console.log('\n=== _\$lc 调用诊断 ===');
    if (d === 'no') console.log('无插桩记录');
    else {
      const arr = JSON.parse(d);
      console.log('记录数:', arr.length);
      console.log(JSON.stringify(arr.slice(0, 30), null, 1));
      fs.writeFileSync('/tmp/nx_lcd_diag2.json', JSON.stringify(arr));
    }
  } catch (e) { console.log('读诊断失败:', e.message.substring(0, 80)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
