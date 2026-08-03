/**
 * 573_struct_reverse.js
 * 系统逆向 nx basearr 段结构
 * 用 S1/S2/S3 数据，对每个字节分类：稳定 / 随keys变 / 随会话变
 * 并对齐 xb len243.js 的段结构（[1]环境指纹 [10]keys19/时间 [7]flag/codeUid [0]指纹块 [6]keys22）
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

const B = d.map(x => x.basearr);
const K = d.map(x => x.keys);

// S1/S2 对齐（同长 167）详细对比
const b1 = B[0], b2 = B[1];
console.log('=== S1 vs S2 逐段对齐（167B）===');
console.log('idx: S1    S2    diff');
for (let i = 0; i < 167; i++) {
  const same = b1[i] === b2[i];
  if (!same) {
    console.log(`[${i}]: ${b1[i].toString(16).padStart(2, '0')}  ${b2[i].toString(16).padStart(2, '0')}  ${same ? '' : 'DIFF'}`);
  }
}

// S1/S2 keys 对应关系：找每个动态字节与 keys 的关系
console.log('\n=== S1/S2 keys 变化 vs basearr 变化 ===');
// keys[19] 变化：S1="22882076" S2="22882078" → 尾字节 6→8
// keys[21] 变化：S1=...01 S2=...03
// keys[22] 大变
// keys[29-32] 变

// 看 basearr [24-29] 是否 = f(keys19) 或 f(keys21 时间)
const t1 = +K[0][21].map(c => String.fromCharCode(c)).join('');
const t2 = +K[1][21].map(c => String.fromCharCode(c)).join('');
console.log('keys21(S1)=', t1, 'keys21(S2)=', t2, '差:', t2 - t1);

// [24-27] 大端
const v1 = b1.slice(24, 28).reduce((a, x) => a * 256 + x, 0);
const v2 = b2.slice(24, 28).reduce((a, x) => a * 256 + x, 0);
console.log('[24-27] 大端: S1=', v1, 'S2=', v2, '差:', v2 - v1, '时间差:', t2 - t1);

// keys19 数字
const n19a = +K[0][19].map(c => String.fromCharCode(c)).join('');
const n19b = +K[1][19].map(c => String.fromCharCode(c)).join('');
console.log('keys19 数字: S1=', n19a, 'S2=', n19b, '差:', n19b - n19a);

// 看 [26-29] 是否 = keys19 数字编码
console.log('\n[26-29] S1 大端:', b1.slice(26, 30).reduce((a, x) => a * 256 + x, 0), 'keys19:', n19a);
console.log('[26-29] S2 大端:', b2.slice(26, 30).reduce((a, x) => a * 256 + x, 0), 'keys19:', n19b);

// 判断 [24-29] 是 execNumberByTime（千万级）
console.log('\n[24-27] 大端 S1=', v1, '(≈', (v1 / 1e7).toFixed(1), '千万)');
console.log('[25-28] 大端 S1=', b1.slice(25, 29).reduce((a, x) => a * 256 + x, 0));
