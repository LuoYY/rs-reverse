// 验证 _\$ez → _\$k0：尝试多种解码方式
const fs = require('fs');
const snap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const tables = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const ez = snap[0].ez.v;
const k0v = tables._$k0.val;
console.log('ez len:', ez.length, 'k0 len:', k0v.length);
console.log('k0 head:', k0v.slice(0, 15).join(','));

// _\$fN 移位解码（从 dynCode 源码提取）
function fN(s) {
  const hi = s.charCodeAt(0) - 97;
  let out = '';
  for (let i = 1; i < s.length; i++) {
    let hr = s.charCodeAt(i);
    if (hr >= 40 && hr < 92) { hr += hi; if (hr >= 92) hr -= 52; }
    else if (hr >= 97 && hr < 127) { hr += hi; if (hr >= 127) hr -= 30; }
    out += String.fromCharCode(hr);
  }
  return out;
}

// 方法 A：ez 数组直接转字符串 → fN → split('`')
const sA = String.fromCharCode.apply(null, ez);
const outA = fN(sA);
const partsA = outA.split('`');
console.log('\n[A] 直接转字符串 fN 解码: len=' + outA.length, 'split 段数=' + partsA.length);
console.log('[A] 段 head:', partsA.slice(0, 8).map(p => JSON.stringify(p.slice(0, 15))).join(' '));

// 方法 B：先 numarr 解码（\x01<digits>）再 fN
function numarrDec(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const b = arr[i];
    if (b === 1) {
      i++; let v = 0, has = false;
      while (i < arr.length && arr[i] >= 48 && arr[i] <= 57) { v = v * 10 + (arr[i] - 48); has = true; i++; }
      out.push(has ? v : -1);
    } else if (b === 0) { out.push(0); i++; }
    else { out.push(b); i++; }
  }
  return out;
}
const decB = numarrDec(ez);
const sB = String.fromCharCode.apply(null, decB);
const outB = fN(sB);
const partsB = outB.split('`');
console.log('\n[B] numarr→fN: len=' + outB.length, 'split 段数=' + partsB.length);
console.log('[B] 段 head:', partsB.slice(0, 8).map(p => JSON.stringify(p.slice(0, 15))).join(' '));

// 方法 C：不 fN，直接 numarr → split
const partsC = sB.split('`');
console.log('\n[C] numarr 直接 split: 段数=' + partsC.length);
console.log('[C] 段 head:', partsC.slice(0, 8).map(p => JSON.stringify(p.slice(0, 15))).join(' '));

// 方法 D：ez 直接 split('`')
const partsD = sA.split('`');
console.log('\n[D] ez 直接 split: 段数=' + partsD.length);
console.log('[D] 段 head:', partsD.slice(0, 8).map(p => JSON.stringify(p.slice(0, 15))).join(' '));

// 方法 E：ez 中反引号 96 计数 + 直接按 96 分割字节数组转数字
const backtickCount = ez.filter(b => b === 96).length;
console.log('\n[E] ez 中 96(反引号) 数量:', backtickCount);
// 按 96 分割字节数组
const segsE = [];
let cur = [];
for (const b of ez) {
  if (b === 96) { segsE.push(cur); cur = []; }
  else cur.push(b);
}
segsE.push(cur);
console.log('[E] 字节段数:', segsE.length);
console.log('[E] 前 10 段:', segsE.slice(0, 10).map(seg => seg.join('')).slice(0, 10));
