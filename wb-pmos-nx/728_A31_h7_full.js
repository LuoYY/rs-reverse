/**
 * 728_A31_h7_full.js
 * dump _\$b1 入口 _\$h7 的完整结构（keys/length/前 60 元素），并找 _\$h7 构造来源
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
  // _\$b1 开头插桩：完整 dump _\$h7
  const t1 = `function _$b1(_$aq,_$_T,_$hr,_$kx){var _$lC,_$hi,_$lc,_$$M,_$ms,_$f$,_$fZ,_$ll,_$_L,_$$q,_$_3,_$mV,_$eZ,_$_F,_$p2;`;
  const r1 = `function _$b1(_$aq,_$_T,_$hr,_$kx){if(!window.__b1h7full){var _tmp=_$h7;window.__b1h7full={type:typeof _tmp,isArr:Array.isArray(_tmp),len:(_tmp&&_tmp.length)||-1,keys:(_tmp&&typeof _tmp==='object')?Object.keys(_tmp).slice(0,80):null,elems:(_tmp&&typeof _tmp==='object')?_tmp.slice(0,80).map(function(x){return typeof x+":"+String(x).substring(0,50);}):null};}var _$lC,_$hi,_$lc,_$$M,_$ms,_$f$,_$fZ,_$ll,_$_L,_$$q,_$_3,_$mV,_$eZ,_$_F,_$p2;`;
  let code = dynCode.split(t1).join(r1);
  console.log('_$b1 插桩:', code !== dynCode);

  // 报错点 _$lc 兜底
  const t2 = `_$lc=_$lc[_$$M],_$ms=_$lc(_$eZ[_$ms])`;
  const r2 = `(window.__lcd=window.__lcd||[],window.__lcd.push(typeof _$lc+":"+String(_$lc).substring(0,40)+"|M:"+String(_$$M).substring(0,30)),window.__lcd.length>80&&window.__lcd.shift(),_$lc=_$lc[_$$M],_$ms=(typeof _$lc==='function'?_$lc(_$eZ[_$ms]):__proxy()))`;
  code = code.split(t2).join(r2);

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
  try { vm.runInContext(code, sb, { timeout: 45000, filename: 'appdyn.js' }); }
  catch (e) { console.log('运行异常:', e.message.substring(0, 120)); }
  await new Promise(r => setTimeout(r, 5000));
  try {
    const d = vm.runInContext('window.__b1h7full ? JSON.stringify(window.__b1h7full) : "no"', sb);
    console.log('\n=== _\$h7 完整结构 ===');
    if (d === 'no') console.log('无记录');
    else {
      const obj = JSON.parse(d);
      console.log('type:', obj.type, 'isArr:', obj.isArr, 'len:', obj.len);
      console.log('keys:', obj.keys ? obj.keys.join(',') : '(无 keys)');
      console.log('前 80 元素:');
      console.log(JSON.stringify(obj.elems, null, 1));
      fs.writeFileSync('/tmp/nx_h7_dump.json', JSON.stringify(obj));
    }
  } catch (e) { console.log('读失败:', e.message.substring(0, 100)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
