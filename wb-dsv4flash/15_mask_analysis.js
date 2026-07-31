/**
 * 15_mask_analysis.js
 *
 * 分析 prefix = keys2[0:13] XOR mask 的规律（跨会话）
 * 以及 prefix+const3 = f(keys) 的各种假设
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, 'captures');
require('module-alias')(path.join(__dirname, '..'));
const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
require('@src/handler/parser/constData').init();

function getData(f) {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  const enc24 = (d.encLog || []).filter(c => c.resultType === 'arr[32]' && (c.args || []).join(',').includes('arr[24]'));
  if (!enc24.length || !d.keys30 || !d.keys30[17]) return null;
  const plain = enc24[0].arg0;
  const key21 = enc24[0].arg1;
  const ele = key21[20];
  return {
    file: f,
    prefix: plain.slice(0, 13),
    const3: plain.slice(16, 19),
    keys2: d.keys30[2].d,
    keys17: d.keys30[17].d,
    keys16: d.keys30[16].d,
  };
}

const sessions = [
  'cd_keys_query_1785488187669.json',
  'plaintext_1785488407275.json',
  'everything_1785488791311.json',
  'everything_1785489159074.json',
].map(f => getData(f)).filter(Boolean);

console.log('=== prefix XOR keys2[0:13] 的掩码（跨会话）===');
const masks = [];
for (const s of sessions) {
  const m = s.prefix.map((b, i) => b ^ s.keys2[i]);
  masks.push(m);
  console.log(s.file.substring(0, 30) + ': ' + m.map(b => b.toString(16).padStart(2, '0')).join(' '));
}

console.log('\n=== 掩码逐位置是否恒定 ===');
for (let i = 0; i < 13; i++) {
  const vals = new Set(masks.map(m => m[i]));
  console.log(`  pos${i}: ${vals.size === 1 ? '恒定 0x' + [...vals][0].toString(16).padStart(2, '0') : '变化 ' + [...vals].map(v => v.toString(16)).join(',')}`);
}

console.log('\n=== 掩码 = keys16 相关? ===');
for (const s of sessions) {
  const m = s.prefix.map((b, i) => b ^ s.keys2[i]);
  const mx16 = m.map((b, i) => b ^ s.keys16[i]);
  console.log('  ' + s.file.substring(0, 20) + ' mask^keys16[0:13]:', mx16.map(b => b.toString(16).padStart(2, '0')).join(' '));
}

console.log('\n=== prefix+const3 = encryptMode1(keys组合)? ===');
const s = sessions[0];
const target = [...s.prefix, ...s.const3];
const tests = [
  ['enc1(keys2[0:16],keys17,0)', () => encryptMode1(s.keys2.slice(0, 16), s.keys17, 0)],
  ['enc1(keys2[0:16],keys16,0)', () => encryptMode1(s.keys2.slice(0, 16), s.keys16, 0)],
  ['enc1(keys17,keys16,0)', () => encryptMode1(s.keys17, s.keys16, 0)],
  ['enc1(keys16,keys17,0)', () => encryptMode1(s.keys16, s.keys17, 0)],
  ['enc1(keys2[0:13],keys17,0)', () => encryptMode1(s.keys2.slice(0, 13), s.keys17, 0)],
  ['enc1(keys17,keys2[0:16],0)', () => encryptMode1(s.keys17, s.keys2.slice(0, 16), 0)],
];
for (const [name, fn] of tests) {
  try {
    const out = fn();
    if (out.length >= 16) {
      const match = out.slice(0, 16).every((b, i) => b === target[i]);
      console.log(`  ${name}: ${out.slice(0,16).map(b=>b.toString(16).padStart(2,'0')).join(' ')} ${match ? '★★匹配!' : ''}`);
    }
  } catch (e) { console.log(`  ${name}: err ${e.message.substring(0, 30)}`); }
}

console.log('\n=== 掩码恒定部分 = 某哈希? ===');
const constMask = masks[0].slice(0, 10); // 0b 16 00 10 00 31 00 01 51 b7
console.log('恒定掩码[0:10]:', constMask.map(b => b.toString(16).padStart(2, '0')).join(' '));
// 测试：恒定掩码 = 某种固定值/哈希
const md5empty = [...crypto.createHash('md5').update('').digest()];
const md5site = [...crypto.createHash('md5').update('pmos.xj.sgcc.com.cn:20080').digest()];
console.log('md5("")[0:10]:', md5empty.slice(0, 10).map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('md5(站点)[0:10]:', md5site.slice(0, 10).map(b => b.toString(16).padStart(2, '0')).join(' '));
// 变化的 pos10-11 vs 什么
console.log('\n=== 变化位置 pos10-11 与 keys 关系 ===');
for (const s of sessions) {
  const m = s.prefix.map((b, i) => b ^ s.keys2[i]);
  console.log(`  ${s.file.substring(0,20)}: pos10=0x${m[10].toString(16)} pos11=0x${m[11].toString(16)}  keys17[10..13]=${s.keys17.slice(10,14).map(b=>b.toString(16)).join(' ')}`);
}

process.exit(0);
