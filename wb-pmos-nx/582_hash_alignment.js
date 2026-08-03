/**
 * 582_hash_alignment.js
 * 精确对齐 basearr[0-23] 每字节与各种 hash/编码的候选
 * 核心：basearr[0-23] 稳定跨会话 → 纯环境指纹编码
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();

const env = JSON.parse(fs.readFileSync('/tmp/env_browser.json', 'utf8'));
const B = [0x64, 0x00, 0x00, 0x24, 0x42, 0x7a, 0x95, 0x00, 0xad, 0xcf, 0xd9, 0xe0, 0x00, 0xbd, 0x2b, 0x7e, 0x2e, 0xc9, 0x9f, 0xd5, 0xcd, 0x78, 0x06, 0x00];
console.log('target:', B.map(x => x.toString(16).padStart(2, '0')).join(' '));

function crc32(data) {
  let c = ~0;
  for (const d of data) {
    c ^= d;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function numToNumarr4(v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }

// 生成候选字节串
const candidates = {};
// 1. crc32 各种输入
const inputs = {
  'crc32(UA)': env.ua,
  'crc32(UA+plat)': env.ua + env.platform,
  'crc32(UA+lang)': env.ua + env.language,
  'crc32(plat)': env.platform,
  'crc32(lang)': env.language,
  'crc32(canvas)': String(env.canvasHash),
  'crc32(UA+canvas)': env.ua + env.canvasHash,
  'crc32(plat+lang)': env.platform + env.language,
  'crc32(ua+lang+plat)': env.ua + env.language + env.platform,
  'crc32(inner)': `${env.innerW}x${env.innerH}`,
  'crc32(screen)': `${env.screenW}x${env.screenH}`,
  'crc32(timezone)': String(env.timezone),
  'crc32(all)': env.ua + env.platform + env.language + env.canvasHash + env.screenW + env.screenH + env.timezone,
  'crc32(full)': JSON.stringify(env),
};
for (const [name, input] of Object.entries(inputs)) {
  const v = crc32([...String(input)].map(c => c.charCodeAt()));
  candidates[name] = numToNumarr4(v);
}

// 2. 直接字节序列（ascii 编码的平台等）
candidates['platform'] = [...env.platform].map(c => c.charCodeAt());
candidates['canvasHash4'] = numToNumarr4(env.canvasHash);

// 3. 时间常量
candidates['hexnum'] = numToNumarr4(parseInt('3136373737323136', 16));

// 匹配：找每个候选在 B 中的最长连续匹配
console.log('\n=== 候选对齐 ===');
for (const [name, bytes] of Object.entries(candidates)) {
  for (let start = 0; start < B.length; start++) {
    let len = 0;
    while (len < bytes.length && start + len < B.length && bytes[len] === B[start + len]) len++;
    if (len >= 2) {
      console.log(`★ ${name} [${bytes.map(x => x.toString(16).padStart(2, '0')).join(' ')}] 匹配 B[${start}+${len}]: ${B.slice(start, start + len).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
    }
  }
}

// 4. 逐字节与 crc32(UA) 异或分析
console.log('\n=== basearr XOR crc32(UA) ===');
const crcUA = candidates['crc32(UA)'];
for (let i = 0; i < 12; i++) {
  console.log(`B[${i}]=${B[i].toString(16).padStart(2, '0')} ^ crc[${i % 4}]=${crcUA[i % 4].toString(16).padStart(2, '0')} = ${(B[i] ^ crcUA[i % 4]).toString(16).padStart(2, '0')}`);
}
