/**
 * 08_plaintext_analysis.js
 *
 * 分析 24B 明文的派生规律：
 *   1. URL nonce（bytes 20-23）是否 = CRC32/MD5/SHA1 等哈希？
 *   2. 13B 会话前缀的派生
 *   3. byte16-18 常量的含义
 *   4. byte13-15 时间编码
 *   5. 尝试把 24B 当作内层密文用各种 key 解密
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, 'captures');
const capFile = process.argv[2] || fs.readdirSync(OUT).filter(f => f.startsWith('plaintext_')).sort().pop();
const data = JSON.parse(fs.readFileSync(path.join(OUT, capFile), 'utf8'));

require('module-alias')(path.join(__dirname, '..'));
const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
require('@src/handler/parser/constData').init();

// 提取 24→32 调用
const enc24 = data.encLog.filter(c => c.resultType === 'arr[32]' && c.args.join(',').includes('arr[24]'));
console.log('捕获的 24→32 调用数:', enc24.length);

// 关联 URL：按照捕获顺序，query 请求顺序与 encLog 顺序对应（应用在后台也发请求，需要对齐）
// 这里用 plaintext 的 URL 关联：通过 bytes 20-23 (nonce) 唯一性映射

const URLs = [
  'POST /px-gateway/GatewayConfig/getGatewayConfig',
  'GET /px-gateway/GatewayConfig/security',
  'POST /px-common-authcenter/auth/v2/captcha/get',
  'POST /px-gateway/GatewayConfig/getGatewayConfig',
  'GET /px-gateway/GatewayConfig/security',
  'POST /px-common-authcenter/auth/v2/verifyType/get',
  'GET /px-gateway/GatewayConfig/security',
  'POST /px-gateway/GatewayConfig/getGatewayConfig',
];

console.log('\n=== 1. URL nonce 哈希测试 ===');
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u32be(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }

const urls2 = [
  { url: '/px-gateway/GatewayConfig/getGatewayConfig', nonce: [0x7f, 0x33, 0x94, 0x9d] },
  { url: '/px-gateway/GatewayConfig/security', nonce: [0x57, 0x4c, 0xf1, 0x52] },
  { url: '/px-common-authcenter/auth/v2/captcha/get', nonce: [0xfd, 0xb2, 0x69, 0x93] },
  { url: '/px-common-authcenter/auth/v2/verifyType/get', nonce: [0xea, 0xf4, 0x15, 0xb2] },
];

for (const { url, nonce } of urls2) {
  const variants = {
    'crc32(url)': u32be(crc32(Buffer.from(url))),
    'crc32(url.toUpperCase)': u32be(crc32(Buffer.from(url.toUpperCase()))),
    'md5(url)[0:4]': [...crypto.createHash('md5').update(url).digest()].slice(0, 4),
    'sha1(url)[0:4]': [...crypto.createHash('sha1').update(url).digest()].slice(0, 4),
    'md5(urlNoSlash)': [...crypto.createHash('md5').update(url.replace(/^\//, '')).digest()].slice(0, 4),
    'crc32(noSlash)': u32be(crc32(Buffer.from(url.replace(/^\//, '')))),
  };
  let hit = false;
  for (const [name, v] of Object.entries(variants)) {
    if (v.every((b, i) => b === nonce[i])) { console.log(`  ★ ${url} → ${name} 匹配!`); hit = true; }
  }
  if (!hit) console.log(`  ${url} → nonce ${nonce.map(b=>b.toString(16)).join(' ')} 无直接哈希匹配`);
}

console.log('\n=== 2. 13B 前缀与 keys 的关系 ===');
const prefix = enc24[0].arg0.slice(0, 13);
const keys17 = data.keys30[17].d;
const keys2 = data.keys30[2].d;
const keys16 = data.keys30[16].d;
console.log('prefix:', prefix.map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('keys17:', keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));

// 测试哈希
const hashTests = {
  'md5(keys17)[0:13]': [...crypto.createHash('md5').update(Buffer.from(keys17)).digest()].slice(0, 13),
  'md5(keys17+keys2)[0:13]': [...crypto.createHash('md5').update(Buffer.from([...keys17, ...keys2])).digest()].slice(0, 13),
  'md5(keys2)[0:13]': [...crypto.createHash('md5').update(Buffer.from(keys2)).digest()].slice(0, 13),
  'md5(keys16+keys17+keys2)[0:13]': [...crypto.createHash('md5').update(Buffer.from([...keys16, ...keys17, ...keys2])).digest()].slice(0, 13),
  'sha1(keys17)[0:13]': [...crypto.createHash('sha1').update(Buffer.from(keys17)).digest()].slice(0, 13),
  'crc32(keys17)': u32be(crc32(Buffer.from(keys17))),
  'crc32(keys2)': u32be(crc32(Buffer.from(keys2))),
  'md5(keys2)[8:21]': [...crypto.createHash('md5').update(Buffer.from(keys2)).digest()].slice(8, 21),
};
for (const [name, v] of Object.entries(hashTests)) {
  console.log(`  ${name}: ${v.map(b => b.toString(16).padStart(2, '0')).join(' ')}${v.slice(0, 13).every((b, i) => b === prefix[i]) ? '  ★★ 前缀匹配!' : ''}`);
}

console.log('\n=== 3. byte16-18 常量含义 ===');
console.log('  byte16-18:', enc24[0].arg0.slice(16, 19).map(b => b.toString(16).padStart(2, '0')).join(' '));

console.log('\n=== 4. byte13-15 时间编码分析 ===');
enc24.forEach((c, i) => {
  const key = c.arg1;
  const ele = key[20];
  const time = ((key[16]^ele)<<24 | (key[17]^ele)<<16 | (key[18]^ele)<<8 | (key[19]^ele)) >>> 0;
  const sec = time % 60, min = Math.floor(time / 60) % 60, hour = Math.floor(time / 3600) % 24;
  console.log(`  [${i}] t=${time} sec=${sec} min=${min} hour=${hour}  b13=${c.arg0[13].toString(16)} b14=${c.arg0[14].toString(16)} b15=${c.arg0[15].toString(16)} b19=${c.arg0[19].toString(16)}`);
});

console.log('\n=== 5. 明文作为内层密文解密尝试 ===');
for (const [kName, kArr] of [['keys16', keys16], ['keys17', keys17], ['keys2[0:16]', keys2.slice(0, 16)], ['keys2[0:32]', keys2.slice(0, 32)]]) {
  for (const flag of [0, 1]) {
    try {
      const pt = encryptMode2([...enc24[0].arg0], [...kArr], flag);
      if (pt && pt.length) {
        const ascii = pt.filter(b => b >= 32 && b <= 126).length / pt.length;
        console.log(`  ${kName} flag=${flag}: ${pt.length}B ASCII=${(ascii*100).toFixed(0)}% [${pt.slice(0, 20).join(',')}]`);
      }
    } catch (e) { console.log(`  ${kName} flag=${flag}: err ${e.message.substring(0, 40)}`); }
  }
}

console.log('\n=== 6. 全部 8 个明文 ===');
enc24.forEach((c, i) => {
  console.log(`  [${i}] ${c.arg0.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
});

process.exit(0);
