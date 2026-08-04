/**
 * 728_B_same_cross_test.js
 * 1. 同会话验证：样本 base + 样本 keys2 → 应该 200
 * 2. 跨会话：样本 A base + 样本 B keys2 → 验证绑定
 * 3. base 是否含 keys2 信息（分析 base[68:] vs 明文basearr 切片）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();

const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

// 分析 base[68:] 与明文basearr(b86[2:140]) 切片的关系
console.log('=== base[68:] vs 明文basearr 切片 XOR/直接 ===');
for (const s of samples) {
  const plain = s.b86.slice(2, 140);
  const tail = s.base.slice(68);
  // 明文 basearr 切片 100B: plain[20:120], [24:124], [38:138] 等
  const slices = {
    p24_124: plain.slice(24, 124),
    p20_120: plain.slice(20, 120),
    p38_138: plain.slice(38, 138),
    p0_100: plain.slice(0, 100),
    p10_110: plain.slice(10, 110),
  };
  const res = [];
  for (const [name, sl] of Object.entries(slices)) {
    if (sl.length !== tail.length) { res.push(`${name}=len${sl.length}≠${tail.length}`); continue; }
    let same = 0;
    for (let i = 0; i < sl.length; i++) if (sl[i] === tail[i]) same++;
    res.push(`${name}:${same}/${sl.length}`);
  }
  console.log(`nsd=${s.nsd} tail=${tail.length}: ${res.join(' ')}`);
}

// base 完整 vs 明文 basearr 各偏移（连续匹配）
console.log('\n=== base 在 b86[2:140] 中搜索 ===');
for (const s of samples) {
  const plain = s.b86.slice(2, 140);
  const bStr = s.base.join(',');
  // 明文 basearr 是否出现在 base 中
  let found = -1;
  for (let L = 20; L >= 5 && found === -1; L--) {
    for (let off = 0; off <= plain.length - L; off++) {
      const sub = plain.slice(off, off + L).join(',');
      const idx = bStr.indexOf(sub);
      if (idx !== -1) { found = idx; console.log(`nsd=${s.nsd}: 明文[${off}:${off+L}] 在 base@${idx}`); break; }
    }
  }
  if (found === -1) console.log(`nsd=${s.nsd}: 明文 basearr 未出现在 base 中`);
}
