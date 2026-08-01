/**
 * 255_analyze_basearr_154.js
 *
 * 深入分析 jsdom basearr（154B）结构：
 * 1. 分段（找段头模式）
 * 2. 0 的分布
 * 3. ASCII 段
 * 4. 与 xj basearr 结构对比
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

(async () => {
  const f = fs.readdirSync(OUT).filter(x => x.startsWith('basearr_jsdom_xor16') || x.startsWith('basearr_jsdom_final')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  const ba = d.basearr || d.ba;
  console.log('basearr:', ba.length, 'B');
  console.log('完整:', JSON.stringify(ba));

  // 1. 扫描 [h][len] 段头（h<=15）
  console.log('\n=== [h][len] 段头扫描 ===');
  for (let i = 0; i < ba.length - 1; i++) {
    const h = ba[i], l = ba[i + 1];
    if (h <= 15 && l < 200 && i + 2 + l <= ba.length) {
      console.log('  @' + i + ': [' + h + '] len=' + l + ' 数据前 6:', ba.slice(i + 2, i + 8).join(','));
    }
  }

  // 2. ASCII 段
  console.log('\n=== ASCII 段 ===');
  let cur = '', start = -1;
  for (let i = 0; i <= ba.length; i++) {
    const v = i < ba.length ? ba[i] : -1;
    if (v >= 32 && v <= 126) { if (cur === '') start = i; cur += String.fromCharCode(v); }
    else { if (cur.length >= 3) console.log('  @' + start + ': [' + cur + ']'); cur = ''; }
  }

  // 3. 找 keys2 出现
  console.log('\n=== keys2 搜索 ===');
  const k2 = [165, 114, 155, 62, 19, 210, 122, 197];
  for (let i = 0; i + 8 <= ba.length; i++) {
    if (ba.slice(i, i + 8).every((v, j) => v === k2[j])) console.log('  keys2 前缀 @' + i);
  }

  // 4. 与 xj basearr example 对比
  console.log('\n=== xj basearr 结构参考 ===');
  const xj = [3, 73, 1, 0, 33, 128, 159, 173, 0, 238, 8, 77, 97, 99, 73, 110, 116, 101, 108, 0, 0, 16, 62, 52, 8, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 4, 0, 3, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 121, 211, 210, 212, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 19, 1, 13, 106, 73, 98, 242, 81, 134, 13, 167, 0, 2, 220, 69, 46, 170, 144, 57, 4, 7, 12, 1, 0, 0, 0, 0, 0, 0, 0, 7, 9, 244, 70, 0, 61, 37, 133, 60, 244, 70, 165, 137, 110, 191, 227, 5, 13, 139, 94, 168, 149, 41, 30, 157, 8, 184, 218, 57, 163, 238, 94, 107, 75, 13, 50, 85, 191, 239, 149, 96, 24, 144, 175, 216, 7, 9, 235, 225, 60, 202, 103, 41, 161, 108, 154, 187, 18, 233, 116, 17, 12, 197, 94, 98, 117, 8, 6, 16, 1, 0, 2, 0, 2, 1, 100, 195, 22, 79, 72, 103, 1, 0, 0, 0, 2, 4, 103, 203, 101, 203, 9, 2, 8, 0, 13, 1, 0];
  console.log('xj basearr:', xj.length, 'B');
  // xj 段结构
  let p = 0;
  console.log('xj 段:', (function() { const s = []; let q = 0; while (q < xj.length - 1 && s.length < 20) { const h = xj[q]; if (h > 15) break; const l = xj[q + 1]; s.push('[' + h + ']l' + l); q += 2 + l; } return s.join(' '); })());
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
