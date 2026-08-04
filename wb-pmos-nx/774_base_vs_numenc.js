/**
 * 774_base_vs_numenc.js
 * 验证 base(179) 与 明文basearr(176,317B) 的关系：
 * 1. 明文basearr → numarrEncrypt → 是否 = base？
 * 2. base 的 [68+] 是否 = 明文 basearr 某段的加密
 * 3. 对比两条链路：589(huffman+base179) vs 53(numarrEncrypt+明文basearr)
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();
const numarrEncrypt = require(path.join(ROOT, 'src/handler/parser/common/numarrEncrypt'));

(async () => {
  // 明文 basearr（176 开头 317B）
  const plain = JSON.parse(fs.readFileSync('wb-pmos-nx/captures/basearr_exact.json', 'utf8')).basearr;
  console.log('明文 basearr len:', plain.length, '前16:', plain.slice(0, 16).join(','));

  // base 179（当前样本）
  const pairsRaw = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
  const pairs = pairsRaw.sessions || pairsRaw.samples || pairsRaw;
  const tpl = pairs.find(s => s.nsd === 99418).base;
  console.log('base(179) len:', tpl.length, '前16:', tpl.slice(0, 16).join(','));

  // numarrEncrypt(明文) 结果
  const ne = numarrEncrypt([...plain]);
  console.log('numarrEncrypt(明文) len:', ne.length, '前16:', ne.slice(0, 16).join(','));
  console.log();
  console.log('numarrEncrypt(明文) 前32 vs base(179) 前32:');
  console.log('  numenc:', ne.slice(0, 32).join(','));
  console.log('  base  :', tpl.slice(0, 32).join(','));

  // 检查 base[22:] 是否含 numenc 的子串
  const neStr = ne.join(',');
  console.log();
  console.log('base 中 numenc 子串搜索:');
  for (let win = 8; win <= 32; win++) {
    for (let i = 0; i + win <= ne.length; i++) {
      const sub = ne.slice(i, i + win).join(',');
      if (tpl.join(',').indexOf(sub) >= 0) { console.log('  找到 win=' + win + ' numenc@' + i); break; }
    }
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
