/**
 * 323_crack_nx_prefix_mask.js
 * 从自动 query 的 request_data 暴力枚举 ele 解密明文 → 反推 nx PREFIX_MASK
 * 验证：nx 的 mask 是否 = xj 的 [0x0b,0x16,0x00,0x10,0x00,0x31,0x00,0x01]
 */
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const XJ_MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];

for (const k of Object.keys(require.cache)) delete require.cache[k];
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require('@src/handler/parser/constData').init();
const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

const data = JSON.parse(fs.readFileSync('/tmp/322_auto_queries.json', 'utf8'));
const uBytes = data.uBytes;
const hBytes = data.hBytes;
const keys2 = uBytes.slice(7, 55);
console.log('自动 keys2:', keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

// 解密函数：request_data(32B) → plain24，用 ele 暴力
function tryDecrypt(requestData, keys17) {
  const results = [];
  for (let ele = 0; ele < 256; ele++) {
    const [key21] = numarrAddTime([...keys17], Math.floor(Date.now() / 1000), ele / 256);
    // 但 key21 的 time 未知！numarrAddTime 用当前时间 → 不对
    // 需要构造：key21 = [(keys17[i]^ele)*16] ++ [(time4[j]^ele)*4] ++ [ele]
    // 手动构造，time 用任意值，因为解密只需要 key21 正确
    // 我们不知道真实 time/ele，但 key21 直接来自加密端
    // 关键：我们不知道 ele。暴力 ele + 检查明文特征（byte16==0xb7）
    const plain = encryptMode1(requestData, key21, 1); // flag=1 是解密？
    if (plain[16] === 0xb7) {
      results.push({ ele, plain });
      if (results.length > 5) return results;
    }
  }
  return results;
}

// 先看 encryptMode1 的 flag 语义：解密用 flag=1？参考记忆：basearr 解密 encryptMode2(C, key, 1)
// 尝试两种 flag
function brute(requestData, label) {
  console.log(`\n=== ${label} 暴力 ele ===`);
  const found = [];
  for (let ele = 0; ele < 256; ele++) {
    const key21 = [];
    // 无法构造 key21（无 keys17）——只验证结构
  }
  // 直接用 request_data 反向暴力：试 flag 0 和 1
  for (let flag = 0; flag <= 1; flag++) {
    for (let ele = 0; ele < 256; ele++) {
      // 构造 key21: 前16=keys17^ele 但 keys17 未知 → 用占位
      // 无法解密，跳过
    }
  }
}

// 正确方法：需要 keys17。用占位测试——只验证"是否有 ele 能解密出合法明文"
// 实际上需要真实 keys17。这里先打印待分析信息
console.log('\n解密 request_data 需要 keys17（cd 派生）+ 加密时的 ele/time');
console.log('先分析：URL 与 HDR 两个 request_data 的关系');
console.log('URL request_data:', uBytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('HDR request_data:', hBytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' '));

// 用同一 ele 时，如果两个 request_data 来自相同 key21，则解密出的明文 prefix 应相同
// 假设：URL 和 HDR 的 request_data 由同一 key21（同请求触发）加密
// 先做一个可执行验证：如果 keys17 已知，暴力 ele 让 URL/HDR 解密出相同 prefix
// 这里用占位：需要后续接 keys17

// 实际可做：用 320 号流程采集完整会话（cd → keys17），然后暴力 ele 解密自动 request_data
console.log('\n→ 需采集 cd 获取 keys17 后运行 324 号完成解密');
console.log('XJ_MASK:', XJ_MASK.map(b => b.toString(16).padStart(2, '0')).join(' '));
