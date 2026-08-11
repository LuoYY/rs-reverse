// v2: 用原生方法（_$mD[N] = String.prototype 方法函数）
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

// 原生方法（_$mD[N] 是函数，用 .call() 调用）
const mD = new Array(626);
mD[4] = String.prototype.substring;
mD[15] = String.prototype.indexOf;
mD[61] = String.prototype.charAt;
mD[62] = String.prototype.replace;
// 可能还有其他 mD 方法（从 _$h7 依赖看只用 4/15/61/62）

// _$f3：直接手写（按 op416 结构）
function buildF3() {
  const K6 = k0[6], K38 = k0[38], K33 = k0[33], K49 = k0[49];
  // op416 数组结构（从提取的 f3_init_raw.txt 人工核对）
  // [0]*9, K6*5, 0*17, K6, 0*3, K38, 0*11, K33*10, 0*7, K49*6, K38*19, 0*4, K38, 0, K49*6, K38*19, 0*5]
  const raw = fs.readFileSync(path.join(__dirname, 'f3_init_raw.txt'), 'utf8');
  const start = raw.indexOf('[');
  let depth = 0, end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '[') depth++;
    else if (raw[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = raw.slice(start + 1, end);
  const parts = body.split(',').map(p => p.trim());
  const arr = parts.map(p => {
    if (p === '0') return 0;
    const m2 = p.match(/_\$k0\[(\d+)\]/);
    return m2 ? k0[+m2[1]] : (p === '' ? 0 : 0);
  });
  // 核对长度（应为 128+）
  console.log('[T2] _$f3 长度:', arr.length, '非0:', arr.filter(x => x !== 0).length);
  return arr;
}
let f3;
try { f3 = buildF3(); } catch (e) { f3 = []; console.log('[T2] f3 解析失败:', e.message); }

// _$np
const npRaw = fs.readFileSync(path.join(__dirname, 'np_init_raw.txt'), 'utf8');
const np = {};
for (const m2 of npRaw.matchAll(/'([^']+)':_\$k0\[(\d+)\]/g)) np[m2[1]] = k0[+m2[2]];

function gL(type, value, hr, kx, k9, kV) { this._$b4 = type; this._$g$ = value; this._$bo = hr; this._$hp = kx; this._$k9 = k9; this._$kV = kV; }

const h7Src = fs.readFileSync(path.join(__dirname, 'fn__$h7.txt'), 'utf8');

const sandbox = {
  _$k0: k0, _$oU: oU, _$b1: b1, _$lc: lc, _$f$: f$,
  _$mD: mD, _$np: np, _$f3: f3,
  _$cD: RegExp, _$gL: gL,
  _$ie: String.prototype.charCodeAt, // _$ie = _$d5['charCodeAt']
  _$mT: String.prototype.slice,      // _$mT = _$d5['slice']（_$oU[81]）
  _$ll: pools.ll, _$_L: pools._L, _$$q: pools.q, _$$M: pools.M, _$oP: pools.oP,
  String, RegExp, Array, console,
};
const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(h7Src, ctx, { filename: 'h7.js' });
  console.log('[T2] _$h7 定义 OK');
} catch (e) {
  console.log('[T2] _$h7 加载失败:', e.message);
  console.log('[T2]', e.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}

const states = require('./nx_md_states.json');
// gS 数字数组 → 字符串（_$h7 期望字符串）
const toStr = (arr) => arr.map(v => String.fromCharCode(v)).join('');
const gs13 = toStr(states[2].gS), gs36 = toStr(states[1].gS), gs92 = toStr(states[0].gS);
for (const [name, gs] of [['gS13', gs13], ['gS36', gs36], ['gS92', gs92]]) {
  try {
    const res = vm.runInContext(`(function(){var pC=_$h7(${JSON.stringify(gs)});return pC;})()`, ctx);
    sandbox.__pC = res;
    const toks = [];
    for (let i = 0; i < 300; i++) {
      const tk = vm.runInContext('(function(){try{var r=__pC();return {t:r._$b4,v:r._$g$};}catch(e){return {err:String(e)}}})()', ctx);
      if (tk.err) { toks.push({ ERR: tk.err }); break; }
      if (tk.t === undefined) break;
      toks.push(tk);
      if (tk.t === 0) break;
    }
    console.log('\n[T2] === ' + name + ' tokens (' + toks.length + ') ===');
    toks.forEach((tk, i) => console.log('  #' + i + ': t=' + tk.t + ' v=' + JSON.stringify(tk.v).slice(0, 50)));
  } catch (e) {
    console.log('[T2] ' + name + ' 异常:', e.message);
  }
}
