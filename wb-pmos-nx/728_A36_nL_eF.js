/**
 * 728_A36_nL_eF.js
 * dump _\$nL / _\$eF 属性名池（从 opcode 224 等赋值），确认 _\$h7 取的是 window 哪个属性
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
  // 在 _\$hb 入口 dump _\$nL/_\$eF/_\$iQ/_\$dn 池的关键索引值
  const t1 = `function _$hb(_$i0){var _$lO,_$og,_$ad,_$pu,_$h7,_$nq,_$en,_$_T;`;
  const r1 = `function _$hb(_$i0){if(!window.__pools){window.__pools={};try{window.__pools.nL57=(_$nL&&_$nL[57])?String(_$nL[57]):null;window.__pools.nL100=(_$nL&&_$nL[100])?String(_$nL[100]):null;window.__pools.eF53=(_$eF&&_$eF[53])?String(_$eF[53]):null;window.__pools.eF147=(_$eF&&_$eF[147])?String(_$eF[147]):null;window.__pools.dn90=(_$dn&&_$dn[90])?String(_$dn[90]):null;window.__pools.bu138=(_$bu&&_$bu[138])?String(_$bu[138]):null;window.__pools.iQ108=(_$iQ&&_$iQ[108])?String(_$iQ[108]):null;window.__pools.iQ144=(_$iQ&&_$iQ[144])?String(_$iQ[144]):null;window.__pools.i0Keys=Object.keys(_$i0).slice(0,80);window.__pools.i0len=Object.keys(_$i0).length;window.__pools.h7val=(_$i0[_$nL[57]])?typeof _$i0[_$nL[57]]+":"+String(_$i0[_$nL[57]]).substring(0,60):"missing";}catch(__e){window.__pools.err=String(__e);}}var _$lO,_$og,_$ad,_$pu,_$h7,_$nq,_$en,_$_T;`;
  let code = dynCode.split(t1).join(r1);
  console.log('插桩:', code !== dynCode);

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
    const d = vm.runInContext('window.__pools ? JSON.stringify(window.__pools) : "no"', sb);
    console.log('\n=== 属性名池 ===');
    console.log(d === 'no' ? '无记录' : JSON.stringify(JSON.parse(d), null, 1));
  } catch (e) { console.log('读失败:', e.message.substring(0, 100)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
