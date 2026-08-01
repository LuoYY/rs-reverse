/**
 * 319_calibrate_keys2.js
 * 用自动 query 的 keys2 校准 P cookie 解密后的 keys2 提取偏移
 */
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

for (const k of Object.keys(require.cache)) delete require.cache[k];
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require('@src/handler/parser/constData').init();
const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < B86_64.length; i++) idxmap[B86_64[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

// 从 auto_query.json 拿自动 query（含 keys2 真值）
const auto = JSON.parse(fs.readFileSync('/tmp/auto_query.json', 'utf8'));
const autoBytes = auto.bytes;
const autoK2 = autoBytes.slice(7, 55);
console.log('自动 query keys2:', autoK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

// 浏览器 P cookie（318 会话）
// 需要从 318 号采集的 cookie。这里直接用 /tmp 无 cookie，改为提示
// 实际方案：318 号没保存 cookie。用一个真实 P cookie 占位验证提取逻辑
console.log('\n注意：318 号未保存 P cookie。验证提取逻辑本身：');
console.log('nextarr 结构假设: [4][8][X8B][48][keys2 48B]');
console.log('→ keys2 = dec.slice(11, 59)');

// 验证 313 号提取 dec.slice(4).slice(11,59) 是否 = dec.slice(15,63)
const dec = [4, 8, 1, 2, 3, 4, 5, 6, 7, 8, 48, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59];
console.log('dec.slice(11,59):', dec.slice(11, 59).slice(0, 4).join(','));
console.log('dec.slice(4).slice(11,59):', dec.slice(4).slice(11, 59).slice(0, 4).join(','));
