/**
 * 220_analyze_basearr_enc.js
 *
 * dump 大[225] 完整内容 + 分析 basearrEncrypt 边界/特征
 * 尝试修复 encryptMode2 解密 162B（pad 到 4 倍数）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));

  console.log('大[225] 完整:');
  console.log(JSON.stringify(plain));

  const nextarr = plain.slice(4);
  // 精确 keys2 边界（48B 全匹配）
  let k2pos = -1;
  for (let i = 0; i + 48 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 48).every((v, j) => v === keys2[j])) { k2pos = i; break; }
  }
  console.log('\nkeys2 全 48B 匹配 @nextarr:', k2pos);
  if (k2pos < 0) {
    // 只前 8 匹配
    for (let i = 0; i + 8 <= nextarr.length; i++) {
      if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; console.log('仅前 8 匹配 @', i); break; }
    }
  }
  const head = nextarr.slice(0, k2pos);
  const baseEnc = nextarr.slice(k2pos + 48);
  console.log('head:', head.length, 'B', head.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('basearrEncrypt:', baseEnc.length, 'B');
  console.log('basearrEncrypt 前 16:', baseEnc.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('basearrEncrypt 后 16:', baseEnc.slice(-16).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 尝试解密：pad 到 4 倍数
  const runTime = 1785416991;
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const k17s = dedup.filter(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12);

  for (const [ki, k17] of k17s.entries()) {
    for (const [pf, padded] of Object.entries({
      raw: baseEnc,
      pad2: [...baseEnc, 0, 0],
      pad14: [...baseEnc, ...new Array(14).fill(0)],
    })) {
      if (padded.length % 4 !== 0) continue;
      try {
        const arr = numarrAddTime([...k17], runTime, 1 / 256)[0];
        const X = encryptMode2([...padded], arr, 0);
        const unx = [];
        for (let i = 0; i < X.length; i++) unx.push(X[i] ^ keys2[i % 16]);
        // 反向 huffman 简化：检查是否含段头
        console.log('k17#' + ki, pf, 'X len=' + X.length, '前 8:', X.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
        if (X.length > 100) {
          console.log('  解码候选（xor keys2 后）前 16:', unx.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
      } catch (e) {
        console.log('k17#' + ki, pf, '错误:', e.message.substring(0, 40));
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
