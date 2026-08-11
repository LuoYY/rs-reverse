// 完整运行 JSVMP tokenizer：注入全部依赖，执行 _$h7(gS) → token 流
// 目标：解码 gS13/gS36/gS92 的 token 流，重建 JS 源码
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ============ 加载资产 ============
const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const k0 = t._$k0.val || t._$k0;
const oU = t._$oU.val || t._$oU;
const b1 = t._$b1.val || t._$b1;
const lc = t._$lc.val || t._$lc;
const mDnames = t._$mD.val || t._$mD; // {idx: 'fn:substring'}
const pools = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_pools_same.json'), 'utf8')).pools;
const f$ = pools.f; // 字符串池

// ============ 构建依赖 ============
// _$mD 方法（字符串操作）
const mD = new Array(626);
mD[4] = (s, a, b) => s.substring(a, b);   // substring
mD[15] = (s, sub, from) => s.indexOf(sub, from); // indexOf
mD[61] = (s, i) => s.charAt(i);            // charAt
mD[62] = (s, re, r) => s.replace(re, r);   // replace
// 其他 mD 可能用到（62 的 regex）
const cD = RegExp; // _$cD

// _$f3 位表（op416 提取，用 k0 值替换）
function buildF3() {
  // 直接按 op416 的字面量：0 和 k0[6]=4, k0[38]=3, k0[33]=9, k0[49]=11
  const K6 = k0[6], K38 = k0[38], K33 = k0[33], K49 = k0[49];
  const f3 = [];
  // 手写 op416 的数组（从提取的原始）
  const raw = fs.readFileSync(path.join(__dirname, 'f3_init_raw.txt'), 'utf8');
  // 解析 _\$k0[N] 引用 → 数字
  const vals = raw.match(/\[([^\]]+)\]/)[1];
  // 简单解析：数字或 _\$k0[N]
  const arr = [];
  const parts = [];
  let cur = '';
  for (const ch of vals) {
    if (ch === ',') { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  for (const p of parts) {
    if (p === '0') arr.push(0);
    else {
      const m2 = p.match(/_\$k0\[(\d+)\]/);
      arr.push(m2 ? k0[+m2[1]] : 0);
    }
  }
  console.log('_$f3 长度:', arr.length, '非0:', arr.filter(x => x !== 0).length);
  return arr;
}
const f3 = buildF3();

// _$np 关键字表（op140 提取）
const npRaw = fs.readFileSync(path.join(__dirname, 'np_init_raw.txt'), 'utf8');
const np = {};
const npMatches = npRaw.matchAll(/'([^']+)':_\$k0\[(\d+)\]/g);
for (const m2 of npMatches) np[m2[1]] = k0[+m2[2]];
console.log('_$np 关键字数:', Object.keys(np).length);

// _$gL 值对象类
function gL(type, value, hr, kx, k9, kV) { this._$b4 = type; this._$g$ = value; this._$bo = hr; this._$hp = kx; this._$k9 = k9; this._$kV = kV; }

// ============ 加载 _$h7 工厂 ============
const h7Src = fs.readFileSync(path.join(__dirname, 'fn__$h7.txt'), 'utf8');

// ============ 组装 sandbox ============
const sandbox = {
  // 全局池
  _$k0: k0, _$oU: oU, _$b1: b1, _$lc: lc, _$f$: f$,
  _$mD: mD, _$np: np, _$f3: f3,
  _$cD: RegExp, _$gL: gL,
  _$ll: pools.ll, _$_L: pools._L, _$$q: pools.q, _$$M: pools.M, _$oP: pools.oP,
  // 环境
  String, RegExp, Array, console,
  // 值对象
  _$gL: gL,
  // 捕获
  __tokens: [],
};
sandbox.global = sandbox;
const ctx = vm.createContext(sandbox);

// 执行 _$h7 工厂定义
try {
  vm.runInContext(h7Src, ctx, { filename: 'h7.js' });
  console.log('[TK] _$h7 定义 OK');
} catch (e) {
  console.log('[TK] _$h7 加载失败:', e.message);
  console.log('[TK] 栈:', e.stack.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
}

// 调用 _$h7(gS)
const states = require('./nx_md_states.json');
const gs13 = states[2].gS, gs36 = states[1].gS, gs92 = states[0].gS;

for (const [name, gs] of [['gS13', gs13], ['gS36', gs36], ['gS92', gs92]]) {
  try {
    const result = vm.runInContext(`(function(){try{var pC=_$h7(${JSON.stringify(gs)});return pC;}catch(e){return {err:String(e),stack:(e.stack||'').split('\\n').slice(0,3).join('|')}}})()`, ctx);
    if (result && result.err) { console.log('[TK] ' + name + ' 错误:', result.err); continue; }
    console.log('[TK] ' + name + ' 工厂 OK, pC typeof:', typeof result);
    // 逐步调用 pC() 取 token
    sandbox.__pC = result;
    const toks = [];
    for (let i = 0; i < 300; i++) {
      const tk = vm.runInContext('(function(){try{var r=__pC();return {t:r._$b4,v:typeof r._$g$==="string"?r._$g$:r._$g$};}catch(e){return {err:String(e)}}})()', ctx);
      if (tk.err) { toks.push({ ERR: tk.err }); break; }
      if (tk.t === undefined) break;
      toks.push(tk);
      if (tk.t === 0) break; // 结束
    }
    console.log('[TK] ' + name + ' tokens (' + toks.length + '):');
    toks.forEach((tk, i) => console.log('  #' + i + ': t=' + tk.t + ' v=' + JSON.stringify(tk.v).slice(0, 40)));
  } catch (e) {
    console.log('[TK] ' + name + ' 异常:', e.message);
  }
}
