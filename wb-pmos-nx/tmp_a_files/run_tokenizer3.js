// v3: 完整 tokenizer 环境（_$pu/_$lO/_$og/_$ad/_$i0/_$c8）
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const k0 = t._$k0.val || t._$k0;
const oU = t._$oU.val || t._$oU;
const b1 = t._$b1.val || t._$b1;
const lc = t._$lc.val || t._$lc;
const pools = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_pools_same.json'), 'utf8')).pools;
const f$ = pools.f;

const mD = new Array(626);
mD[4] = String.prototype.substring;
mD[15] = String.prototype.indexOf;
mD[61] = String.prototype.charAt;
mD[62] = String.prototype.replace;

// _$f3（128 项）
const raw = fs.readFileSync(path.join(__dirname, 'f3_init_raw.txt'), 'utf8');
const start = raw.indexOf('['); let depth = 0, end = -1;
for (let i = start; i < raw.length; i++) { if (raw[i] === '[') depth++; else if (raw[i] === ']') { depth--; if (depth === 0) { end = i; break; } } }
const parts = raw.slice(start + 1, end).split(',').map(p => p.trim());
const f3 = parts.map(p => p === '0' ? 0 : (p.match(/_\$k0\[(\d+)\]/) ? k0[+p.match(/_\$k0\[(\d+)\]/)[1]] : 0));

const npRaw = fs.readFileSync(path.join(__dirname, 'np_init_raw.txt'), 'utf8');
const np = {};
for (const m2 of npRaw.matchAll(/'([^']+)':_\$k0\[(\d+)\]/g)) np[m2[1]] = k0[+m2[2]];

function gL(type, value, hr, kx, k9, kV) { this._$b4 = type; this._$g$ = value; this._$bo = hr; this._$hp = kx; this._$k9 = k9; this._$kV = kV; }

// _$c8（空白表）：_$c8=[_$k0[184],_$k0[347],_$k0[92],_$k0[261],_$k0[259],_$k0[356],_$k0[365],_$k0[263],_$k0[364],_$k0[353],_$k0[310],_$k0[270],_$k0[291],_$k0[255],_$k0[264],_$k0[343],_$k0[329]]
const c8 = [k0[184], k0[347], k0[92], k0[261], k0[259], k0[356], k0[365], k0[263], k0[364], k0[353], k0[310], k0[270], k0[291], k0[255], k0[264], k0[343], k0[329]];

// 辅助函数
const lO = (v) => (v >= k0[14] && v <= k0[75]) || (v >= k0[94] && v <= k0[88]) || v >= k0[216];
const og = (v) => v >= k0[21] && v <= k0[22];
const ad = (v) => v < k0[5] ? (f3[v] & k0[15]) : lO(v);
const pu = (v) => v < k0[5] ? (f3[v] & 1) : lO(v);
const i0 = (v) => c8.indexOf(v) >= 0;

const h7Src = fs.readFileSync(path.join(__dirname, 'fn__$h7.txt'), 'utf8');

const sandbox = {
  _$k0: k0, _$oU: oU, _$b1: b1, _$lc: lc, _$f$: f$,
  _$mD: mD, _$np: np, _$f3: f3,
  _$cD: RegExp, _$gL: gL,
  _$ie: String.prototype.charCodeAt,
  _$mT: String.prototype.substr, // _$oU[81]="substr"
  _$ll: pools.ll, _$_L: pools._L, _$$q: pools.q, _$$M: pools.M, _$oP: pools.oP,
  _$c8: c8, _$lO: lO, _$og: og, _$ad: ad, _$pu: pu, _$i0: i0,
  _$aN: String.fromCharCode,
  String, RegExp, Array, console,
};
const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(h7Src, ctx, { filename: 'h7.js' });
  console.log('[T3] _$h7 定义 OK');
} catch (e) { console.log('[T3] 加载失败:', e.message, e.stack.split('\n').slice(0, 3).join('\n')); process.exit(1); }

const states = require('./nx_md_states.json');
const toStr = (arr) => arr.map(v => String.fromCharCode(v)).join('');
for (const [name, gsArr] of [['gS13', states[2].gS], ['gS36', states[1].gS], ['gS92', states[0].gS]]) {
  const gs = JSON.stringify(toStr(gsArr));
  try {
    const res = vm.runInContext(`(function(){try{var pC=_$h7(${gs});return pC;}catch(e){return {err:String(e.message),st:String(e.stack).split(String.fromCharCode(10)).slice(0,4).join("|")};}})()`, ctx);
    if (res && res.err) { console.log('[T3] ' + name + ' h7 错误:', res.err); console.log('   ', res.st); continue; }
    sandbox.__pC = res;
    const toks = [];
    for (let i = 0; i < 500; i++) {
      const tk = vm.runInContext(`(function(){try{var r=__pC();return {t:r._$b4,v:typeof r._$g$==="string"?r._$g$:(r._$g$&&r._$g$.length!==undefined?"L"+r._$g$.length:String(r._$g$))};}catch(e){return {err:String(e.message)};}})()`, ctx);
      if (tk.err) { toks.push({ ERR: tk.err }); break; }
      if (tk.t === undefined) break;
      toks.push(tk);
      if (tk.t === 0) break;
    }
    console.log('\n[T3] === ' + name + ' tokens (' + toks.length + ') ===');
    toks.forEach((tk, i) => console.log('  #' + i + ': t=' + tk.t + ' v=' + JSON.stringify(tk.v).slice(0, 60)));
  } catch (e) { console.log('[T3] ' + name + ' 异常:', e.message); }
}
