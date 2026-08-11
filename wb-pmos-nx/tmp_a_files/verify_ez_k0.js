// 验证：_$ez → _$fN(移位解码) → split('`') → Number → _$k0
// _$fN: 首字符-97 为移位，每个字符码+移位，映射回 [40,92)+[97,127) 范围
const fs = require('fs');
const ezData = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json');
const tables = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');

// 检查 _$ez 格式
console.log('ezData keys:', Object.keys(ezData));
const ez0 = ezData['0'] && ezData['0'].ez;
const ez = ez0 && ez0.v;
console.log('ez type:', typeof ez, 'len:', ez && ez.length);

// numarr 解码：_$ez 是 numarr 编码的字符串（\x01<digits> = 字节值）
// 先实现 numarr 解码：把 ez 还原成字符串
function numarrDecode(arr) {
  // 每个元素：0x01 后跟数字 = 字节值；其他 = 字符
  let s = '';
  let i = 0;
  while (i < arr.length) {
    if (arr[i] === 1) {
      // 数字直到非数字
      let n = 0;
      i++;
      while (i < arr.length && arr[i] >= 48 && arr[i] <= 57) {
        n = n * 10 + (arr[i] - 48);
        i++;
      }
      s += String.fromCharCode(n);
    } else {
      s += String.fromCharCode(arr[i]);
      i++;
    }
  }
  return s;
}

// _$fN 移位解码
function fN(s) {
  const hi = s.charCodeAt(0) - 97;
  let out = '';
  for (let i = 1; i < s.length; i++) {
    let hr = s.charCodeAt(i);
    if (hr >= 40 && hr < 92) {
      hr += hi;
      if (hr >= 92) hr -= 52;
    } else if (hr >= 97 && hr < 127) {
      hr += hi;
      if (hr >= 127) hr -= 30;
    }
    out += String.fromCharCode(hr);
  }
  return out;
}

// 测试 1: ez 数组 → numarr 解码 → 字符串
const ezArr = Array.isArray(ez) ? ez : ez.split('').map(c => c.charCodeAt(0));
const decStr = numarrDecode(ezArr);
console.log('\n[1] numarr 解码后长度:', decStr.length);
console.log('[1] 解码 head:', decStr.slice(0, 60));
console.log('[1] 含反引号数量:', (decStr.match(/`/g) || []).length);

// 测试 2: 直接 _$fN 移位解码（如果 ez 已经是"数字字符流"）
const fNout = fN(decStr);
console.log('\n[2] fN 解码 head:', fNout.slice(0, 60));
console.log('[2] fN 解码长度:', fNout.length);

// 测试 3: split('`') → Number
const parts = fNout.split('`');
console.log('\n[3] split 段数:', parts.length);
console.log('[3] 前 10 段:', parts.slice(0, 10).map(p => p.slice(0, 20)));
const nums = parts.map(p => Number(p));
console.log('[3] Number 前 10:', nums.slice(0, 10));
console.log('[3] Number 有效数:', nums.filter(n => !isNaN(n)).length);

// 对比 tables_init 的 _$k0
const k0v = tables._$k0 && tables._$k0.val;
console.log('\ntables _$k0 len:', k0v && k0v.length);
if (k0v) console.log('tables k0 head:', k0v.slice(0, 10));
if (k0v && nums.length >= k0v.length) {
  let same = 0;
  for (let i = 0; i < k0v.length; i++) if (nums[i] === k0v[i]) same++;
  console.log('k0 匹配:', same + '/' + k0v.length);
  // 第一个不匹配位置
  for (let i = 0; i < k0v.length; i++) {
    if (nums[i] !== k0v[i]) { console.log('首个不匹配 @' + i + ': nums=' + nums[i] + ' tables=' + k0v[i]); break; }
  }
}
