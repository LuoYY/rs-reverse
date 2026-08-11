// v3: 补 _$iz 和所有依赖，运行 _$iE
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const iE = fs.readFileSync(path.join(__dirname, 'jsvmp_iE_closure.js'), 'utf8');
// 提取 _$iz（@112244）+ _$en + _$fN
const dyn = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');
function extractFn(c, name, startPos) {
  let i = startPos !== undefined ? startPos : c.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, end = -1;
  for (let j = c.indexOf('{', i); j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
const izSrc = extractFn(dyn, '_$iz', 112244);
const enSrc = extractFn(dyn, '_$en');
const fNSrc = extractFn(dyn, '_$fN');
console.log('[O3] _$iz:', izSrc ? '✓' : '✗', '_$en:', enSrc ? '✓' : '✗', '_$fN:', fNSrc ? '✓' : '✗');

// gS 解码
const gsStart = dyn.indexOf('_$iE("r2mKa');
const seg = dyn.slice(gsStart + 6);
let j = 0, inEscape = false;
for (; j < seg.length; j++) {
  if (inEscape) { inEscape = false; continue; }
  if (seg[j] === '\\') { inEscape = true; continue; }
  if (seg[j] === '"') break;
}
const gs = seg.slice(0, j).replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\\\/g, '\\').replace(/\\"/g, '"');
console.log('[O3] gS len:', gs.length);

const sandbox = {
  Array, Date, RegExp, String, Math, JSON, console,
  _$a8: Array, _$fF: Date, _$cD: RegExp,
  _$a2: { location: { href: '' }, navigator: { userAgent: '' }, document: {} },
  _$av: { fromCharCode: String.fromCharCode },
};
const ctx = vm.createContext(sandbox);
try { vm.runInContext(iE, ctx); console.log('[O3] iE OK'); } catch (e) { console.log('[O3] iE 失败:', e.message); process.exit(1); }
try { vm.runInContext(izSrc, ctx); console.log('[O3] iz OK'); } catch (e) { console.log('[O3] iz 失败:', e.message); }
if (enSrc) { try { vm.runInContext(enSrc, ctx); console.log('[O3] en OK'); } catch (e) { console.log('[O3] en 失败:', e.message); } }
if (fNSrc) { try { vm.runInContext(fNSrc, ctx); console.log('[O3] fN OK'); } catch (e) { console.log('[O3] fN 失败:', e.message); } }

sandbox.__gs = gs;
try {
  const r = vm.runInContext(`(function(){
    try {
      var ret = _$iE(__gs, [], [], [], [], [], []);
      return {ok:true, type: typeof ret, v: String(ret).slice(0, 80)};
    } catch(e) { return {err: String(e && e.message || e), st: String(e.stack).split(String.fromCharCode(10)).slice(0,8)}; }
  })()`, ctx);
  console.log('[O3] 结果:', JSON.stringify(r).slice(0, 400));
} catch (e) { console.log('[O3] 调用异常:', e.message); }
process.exit(0);
