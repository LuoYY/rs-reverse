// 同会话决定性验证：
// 1. _$ez(字符串1954) → _$fN 移位解码 → split('`') → Number → _$k0 ?
// 2. _$k0 索引序列(pc=1527) → _$kt 初始数组 vs _$kt 最终
const snap = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_k0_kt_same.json');
const idxSeq = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_init_idx.json');

const ez = snap.k0Snap.ez; // ['s', [...字符码]]
const ezStr = ez[1].map(c => String.fromCharCode(c)).join('');
const k0 = snap.k0Snap.k0; // 423
const kt = snap.ktFinal; // 209

console.log('ezStr len:', ezStr.length, 'k0 len:', k0.length, 'kt len:', kt.length);
console.log('ezStr head:', JSON.stringify(ezStr.slice(0, 80)));

// _$fN 移位解码
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

const dec = fN(ezStr);
console.log('\n[1] fN 解码 len:', dec.length);
console.log('[1] dec head:', JSON.stringify(dec.slice(0, 80)));
const backticks = (dec.match(/`/g) || []).length;
console.log('[1] 反引号数:', backticks);

// split('`') → Number
const parts = dec.split('`');
console.log('[1] split 段数:', parts.length);
const nums = parts.map(p => Number(p));
console.log('[1] Number 有效:', nums.filter(n => !isNaN(n)).length);

// 对比 _$k0
let same = 0;
for (let i = 0; i < Math.min(nums.length, k0.length); i++) if (nums[i] === k0[i]) same++;
console.log('[1] _$k0 匹配:', same + '/' + k0.length);
// 首个不匹配
for (let i = 0; i < Math.min(nums.length, k0.length); i++) {
  if (nums[i] !== k0[i]) { console.log('[1] 首个不匹配 @' + i + ': ' + nums[i] + ' vs ' + k0[i]); break; }
}

// 2. 用 k0 + 索引序列构造 _$kt 初始数组
console.log('\n[2] 索引序列长度:', idxSeq.length);
const init = idxSeq.map(t => t.type === 'k0' ? k0[t.idx] : t.val);
console.log('[2] init head[0:65]:', init.slice(0, 65).join(','));
console.log('[2] kt 最终 head[0:65]:', kt.slice(0, 65).join(','));
// 对比 init[0:209] vs kt
let same2 = 0;
for (let i = 0; i < Math.min(209, init.length); i++) if (init[i] === kt[i]) same2++;
console.log('[2] init[0:209] vs kt 匹配:', same2 + '/' + Math.min(209, init.length));
// 差异位置
const diffs = [];
for (let i = 0; i < Math.min(209, init.length); i++) if (init[i] !== kt[i]) diffs.push(i);
console.log('[2] 差异位置(' + diffs.length + '):', diffs.slice(0, 40).join(','));
// 差异位置的值对比（前 20）
diffs.slice(0, 20).forEach(i => {
  console.log('   @' + i + ': init=' + init[i] + ' final=' + kt[i]);
});
