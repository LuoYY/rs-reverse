/**
 * 146_len_sensitivity.js
 *
 * encryptMode1/2 长度自洽测试：各种 plain 长度 → 加密 → 解密 → 对比
 * 找 Invalid array length 的触发长度（可能是 nx cookie 495B 的 bug 根因）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];
  const rt = Math.floor(Date.now() / 1000);

  // 测试各种长度（覆盖 264/460/491/495 等）
  const lens = [16, 17, 20, 32, 33, 48, 49, 100, 200, 264, 265, 300, 400, 460, 480, 491, 495, 496, 500, 600];
  for (const L of lens) {
    const plain = Array.from({ length: L }, (_, i) => (i * 3 + 7) % 256);
    try {
      const key = numarrAddTime([...K16], rt, 0.5)[0];
      const enc = encryptMode1([...plain], key, 1, 0.5);
      const dec = encryptMode2([...enc], key, 1);
      const same = dec.length === plain.length && dec.every((v, i) => v === plain[i]);
      console.log(`len=${L}: enc=${enc.length} dec=${dec.length} ${same ? '✓' : '✗ 不一致'}`);
    } catch (e) {
      console.log(`len=${L}: ★ 错误: ${e.message.substring(0, 40)}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
