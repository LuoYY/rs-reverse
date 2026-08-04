/**
 * 775_redecode_with_proper_tree.js
 * 用项目 numarrEncrypt68 的正确 huffman 树重新解码 P cookie
 * 对比 589 的 getTree() vs numarrEncrypt68 树的结果
 * 若 basearrB（64开头）是正确 basearr，则动态段 [24-29] 才是真正障碍
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();
const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
const numarrEncrypt68 = require(path.join(ROOT, 'src/handler/parser/common/numarrEncrypt'));
const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

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

(async () => {
  // 用 534 保存的 basearrB 数据验证
  // 读取 P cookie 样本
  const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
  // 我们存的 pairs 只有 base，没有 P cookie value。用 AgentA 的 P cookie
  // 检查可用的 P cookie 文件
  console.log('检查 P cookie 文件:');
  const candidates = ['/tmp/nx_browser_P_full.txt', '/tmp/nx_browser_cookies_full.json', '/tmp/nx_browser_cookies.json'];
  candidates.forEach(f => { if (fs.existsSync(f)) console.log('  ' + f + ' 存在 (' + fs.statSync(f).size + 'B)'); });
  // 也看 534 的 huff 长度：huff len=156
  console.log('\n534 参考: huff len=156, basearrB len=170, 前24=64,0,0,24,42,7a,95,0');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
