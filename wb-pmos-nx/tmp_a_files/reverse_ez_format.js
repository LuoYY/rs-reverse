// 逆向 _$ez 编码格式：从 keys 段重建
// _$ez[0:7]='3.64.640', [7]=48, [8:56]=keys2
// 关键：找出每个 keys 段在 _$ez 中的位置（长度前缀模式）
const ezSnap = require('./nx_ez_full_final.json');
const ez = ezSnap[0].ez.v;

// _$ez 完整转字符
const str = ez.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
console.log('_$ez 前 100 字符:');
console.log(str.slice(0, 100));
console.log('\n_$ez 后 100 字符:');
console.log(str.slice(-100));

// 找 keys2 位置：_$ez[8:56] = keys2（74,239,100,9,...）
console.log('\n_$ez[7:60]:', ez.slice(7, 60).join(','));
console.log('[7]=48 (keys2 长度标记), [8:56]=48B keys2');

// 找 keys[7] 资源列表位置：搜 'ySMTydHh' 或 'MurR7rxG'
const mIdx = str.indexOf('MurR7rxG');
console.log('\nMurR7rxG @', mIdx);
if (mIdx > 0) console.log('之前 20 字节:', ez.slice(mIdx - 20, mIdx).join(','));
// 资源列表前应有长度标记
console.log('资源列表起始 @', mIdx - 30, ':', ez.slice(mIdx - 30, mIdx).map(v => v >= 32 ? String.fromCharCode(v) : v).join('|'));

// 找 K16（215,90,92,114,...）
const k16 = [215, 90, 92, 114, 190, 161, 210, 59];
const k16str = k16.join(',');
const ezStr = ez.join(',');
const k16Idx = ezStr.indexOf(k16str);
console.log('\nK16 @', k16Idx, '(字节位置', (ezStr.slice(0, k16Idx).match(/,/g) || []).length + ')');
console.log('K16 前 20 字节:', ez.slice(k16Idx - 20, k16Idx).map(v => v >= 32 ? String.fromCharCode(v) : v).join('|'));

// 找 67402 (nsd)
const nsdIdx = str.indexOf('67402');
console.log('\n67402 @', nsdIdx, '前后:', str.slice(nsdIdx - 20, nsdIdx + 10));

// 找 521019862 (时间戳)
const tsIdx = str.indexOf('521019862');
console.log('521019862 @', tsIdx);

// 找 7z,a,aac (扩展名)
const extIdx = str.indexOf('7z,a,aac');
console.log('7z,a,aac @', extIdx, '前后:', str.slice(extIdx - 15, extIdx + 10));
