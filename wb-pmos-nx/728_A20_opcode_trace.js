/**
 * 728_A20_opcode_trace.js
 * 在 _\$b1（内层 VM dispatcher）循环开头插桩：记录 opcode _\$hi 序列 + 栈深度
 * 目标：定位 Cannot set properties of undefined (setting '4') 卡在哪个 opcode
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

  // 1. 报错点 _$lc 兜底（逗号表达式）
  const t1 = `_$lc=_$lc[_$$M],_$ms=_$lc(_$eZ[_$ms])`;
  const r1 = `(window.__lcd=window.__lcd||[],window.__lcd.push(typeof _$lc+":"+String(_$lc).substring(0,40)+"|M:"+String(_$$M).substring(0,30)),window.__lcd.length>80&&window.__lcd.shift(),_$lc=_$lc[_$$M],_$ms=(typeof _$lc==='function'?_$lc(_$eZ[_$ms]):__proxy()))`;
  let code = dynCode.split(t1).join(r1);

  // 2. _$b1 循环开头插桩：记录 opcode
  const loopHead = `for(_$lC=_$_T;_$lC<_$hr;_$lC++ ){_$hi=_$ll[_$lC];`;
  const loopRepl = `for(_$lC=_$_T;_$lC<_$hr;_$lC++ ){window.__tr=(window.__tr||[]);window.__tr.push(_$hi);if(window.__tr.length>40000)window.__tr.shift();_$hi=_$ll[_$lC];`;
  code = code.split(loopHead).join(loopRepl);
  console.log('插桩 loop:', code.indexOf('window.__tr') >= 0);
  fs.writeFileSync('/tmp/nx_app_dyn_trace.js', code);

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
  `, sb);
  try { vm.runInContext('window.$_ts = ' + tsData + ';', sb); } catch (e) {}
  try { vm.runInContext(code, sb, { timeout: 45000, filename: 'appdyn.js' }); }
  catch (e) { console.log('运行异常:', e.message.substring(0, 120)); }
  await new Promise(r => setTimeout(r, 5000));

  try {
    const tr = vm.runInContext('window.__tr ? JSON.stringify(window.__tr) : "no"', sb);
    console.log('\n=== opcode 轨迹 ===');
    if (tr === 'no') console.log('无轨迹');
    else {
      const arr = JSON.parse(tr);
      console.log('轨迹长度:', arr.length);
      console.log('最后 40 个 opcode:', arr.slice(-40).join(','));
      // 频率统计
      const freq = {};
      for (const op of arr) freq[op] = (freq[op] || 0) + 1;
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15);
      console.log('高频 opcode:', top.map(([k, v]) => `${k}(${v})`).join(' '));
      fs.writeFileSync('/tmp/nx_app_opcode_trace.json', JSON.stringify(arr));
    }
  } catch (e) { console.log('读轨迹失败:', e.message.substring(0, 80)); }

  try {
    const ba = vm.runInContext('window.__basearrs ? JSON.stringify(window.__basearrs) : "no"', sb);
    console.log('\nbasearr 捕获:', ba === 'no' ? '无' : JSON.stringify(JSON.parse(ba).map(a => a.length)));
  } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
