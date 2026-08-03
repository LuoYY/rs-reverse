/**
 * 728_A22_err_loc.js
 * 用 wrapper（try/catch + __err）精确定位 "Cannot set properties of undefined (setting '4')"
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
  // 报错点 _$lc 兜底
  const t1 = `_$lc=_$lc[_$$M],_$ms=_$lc(_$eZ[_$ms])`;
  const r1 = `(window.__lcd=window.__lcd||[],window.__lcd.push(typeof _$lc+":"+String(_$lc).substring(0,40)+"|M:"+String(_$$M).substring(0,30)),window.__lcd.length>80&&window.__lcd.shift(),_$lc=_$lc[_$$M],_$ms=(typeof _$lc==='function'?_$lc(_$eZ[_$ms]):__proxy()))`;
  const code = dynCode.split(t1).join(r1);

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
  const wrapped = '(function(){try{' + code + ';}catch(__e){window.__err={msg:String(__e.message),stack:String(__e.stack)};throw __e;}})()';
  try { vm.runInContext(wrapped, sb, { timeout: 45000, filename: 'wrap2.js' }); }
  catch (e) { console.log('运行异常:', e.message.substring(0, 120)); }
  try {
    const er = vm.runInContext('window.__err ? JSON.stringify(window.__err) : "no-err"', sb);
    if (er && er !== 'no-err') {
      const e2 = JSON.parse(er);
      console.log('msg:', e2.msg);
      console.log('stack 前 6 行:', e2.stack.split('\n').slice(0, 6).join('\n'));
      const wm = e2.stack.match(/wrap2\.js:(\d+):(\d+)/);
      if (wm) {
        const line = +wm[1], col = +wm[2];
        const wrapLines = wrapped.split('\n');
        let absOff = 0;
        for (let i = 0; i < line - 1 && i < wrapLines.length; i++) absOff += wrapLines[i].length + 1;
        absOff += col - 1;
        const prefix = '(function(){try{'.length;
        const origOff = absOff - prefix;
        console.log('\n原始 dynCode 偏移:', origOff);
        console.log('上下文:', dynCode.substring(Math.max(0, origOff - 300), origOff + 300));
      }
    }
  } catch (e) { console.log('读 err 失败:', e.message.substring(0, 80)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
