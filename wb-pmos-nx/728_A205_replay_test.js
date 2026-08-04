/**
 * 728_A205_replay_test.js
 * base 结构重建 + cookie 重放测试
 * 用真实 base 模板重建（固定头 + 段结构 + 真实[68:92]），测试服务器是否接受
 * 方法：采集浏览器 P cookie（固定 nsd）→ 修改 base 段 → 重放测试
 *
 * 说明：需要完整的 P cookie 重放链路（O+P 配对）。
 * 这里先做：验证 base 提取闭环 + 结构重建的数学正确性。
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

(async () => {
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

  function decodeB86(str) {
    const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
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

  // 读取真实 base 和 keys
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  const base = baseD.base, keys2 = baseD.keys2;

  // 1. 结构重建：固定头 + 真实段
  console.log('=== 结构重建验证 ===');
  console.log('原始 base len:', base.length);
  const fixedHead = base.slice(0, 22);
  console.log('固定头 [0-21]:', fixedHead.join(','));

  // 重建：固定头 + [22-28] 会话段（用新随机）+ [29-67] 固定 + [68:92] 用模板 + 尾
  const fixed29_67 = base.slice(29, 68);
  const template_6892 = base.slice(68, 92);
  const tail = base.slice(92);

  // 变体会话段 [22-28]
  const newSession = [1, 2, 3, 4, 5, 6, 7];
  const rebuilt = [...fixedHead, ...newSession, ...fixed29_67, ...template_6892, ...tail];
  console.log('重建 base len:', rebuilt.length, '原始:', base.length);
  console.log('重建前 30:', rebuilt.slice(0, 30).join(','));
  console.log('重建尾 10:', rebuilt.slice(-10).join(','));

  // 2. 验证结构一致性（除会话段外应与原 base 一致）
  let diff = 0;
  for (let i = 0; i < Math.min(base.length, rebuilt.length); i++) {
    if (base[i] !== rebuilt[i] && !(i >= 22 && i <= 28)) diff++;
  }
  console.log('除会话段外差异数:', diff);

  // 3. 保存重建 base（供重放测试）
  fs.writeFileSync('/tmp/nx_base_rebuilt.json', JSON.stringify({ base: rebuilt, keys2, fixedHead, sessionSeg: newSession, fixed29_67, template_6892, tail }));
  console.log('已保存 /tmp/nx_base_rebuilt.json（重建 base 供重放测试）');

  // 4. 说明：重放需要完整 cookie 加密链（O+P 配对）
  console.log('\n=== 重放测试说明 ===');
  console.log('重放需要: 浏览器 O cookie + P cookie（含重建 base）配对');
  console.log('步骤: 浏览器采集 → 改 base[22-28] → 重新加密 → 用 O+P 请求 → 检查 200/412/400');
  console.log('参考: src/handler 的 cookie 重构逻辑（534 号验证 200）');
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
