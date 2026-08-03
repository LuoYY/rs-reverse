/** 572 nx basearr 动态段 [24-29] vs 时间戳/keys19 关系 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

// 数据集带采集时间戳吗？看 nsd 与文件时间
for (let i = 0; i < d.length; i++) {
  const b = d[i].basearr;
  const keys = d[i].keys;
  console.log(`\nS${i + 1} nsd=${d[i].nsd} basearr_len=${b.length}`);
  console.log('[24-29]:', b.slice(24, 30).map(x => x.toString(16).padStart(2, '0')).join(' '));
  // 各 4 字节大端
  for (let j = 24; j <= 30; j++) {
    if (j + 4 <= b.length) {
      const v = b.slice(j, j + 4).reduce((a, x) => a * 256 + x, 0);
      console.log(`  [${j}-${j + 3}] 大端=${v} 小端=${b[j] | b[j + 1] << 8 | b[j + 2] << 16 | b[j + 3] << 24}`);
    }
  }
  // keys19 ASCII
  if (keys[19]) console.log('keys19:', keys[19].map(c => String.fromCharCode(c)).join(''), 'hex:', keys[19].map(x => x.toString(16).padStart(2, '0')).join(' '));
  // keys21 (r2mkaTime?)
  if (keys[21]) console.log('keys21:', keys[21].map(x => x.toString(16).padStart(2, '0')).join(' '));
  if (keys[24]) console.log('keys24:', keys[24].map(x => x.toString(16).padStart(2, '0')).join(' '));
  // keys[3] 可能是时间
  if (keys[3]) console.log('keys3:', keys[3].map(x => x.toString(16).padStart(2, '0')).join(' '));
}

// 检查采集时间（文件 mtime vs basearr 时间字段）
const st = fs.statSync('/tmp/full_keys_dataset.json');
console.log('\n数据集创建时间:', new Date(st.mtimeMs).toISOString());
console.log('unix:', Math.floor(st.mtimeMs / 1000), 'hex:', Math.floor(st.mtimeMs / 1000).toString(16));
