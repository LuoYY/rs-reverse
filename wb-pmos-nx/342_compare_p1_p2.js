/**
 * 342_compare_p1_p2.js
 * 对比用户 P1/P2 的 nextarr 全部字节，找 basearr 差异位置与模式（时间戳?）
 */
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const ROOT = path.join(__dirname, '..');

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

for (const k of Object.keys(require.cache)) delete require.cache[k];
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require('@src/handler/parser/constData').init();
const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < B86_64.length; i++) idxmap[B86_64[i]] = i;
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

const P1 = 'aFXKRM9gHunpFkM4eaeRd-2L_OrUQsp5emOV19xeoW9cBT-9EYrrJnNwEpN_AVQHHiME2MSZHgDVSog6_lXzcC7J1qp3k2muf7Qf4o9H-OR_BpEMRzLAGYXLQ_592WBbvbuSFcdUsQpxXbepU6syqzqVKNrqxuPmtfn2ZjMzh2B5Xq_ni3Vse34dO9b4-Wkch9hBJh9-jVUE3Es8RJQYYWRbpbv2xgMSO2bO-g3amIhYSWCq6_62vx9rTIm-tw-6keX-1Br3xVw4hZ9Y74KEgieMMffNu7rSZ1cXt4l_Gwo-GMzMmSDz7TdroKKu_qT8W1-E6SGoEC-GkV1QdTWIismJuVCM8wEur6gNJfcRX6zs6qhYtwREExNZW4VsAdEx0qO84TAwmS_NRu4iODIqY5lYDVOzxp9kA1sggG2GVR8vaBebrQ6TpRzjDmEvVnLtoNKjeiYPMHQ1lqus9Lz1isq';
const P2 = 'aYCBNYTRrfqUfvtUqJ5NBqh8CtcdBsTy9RbrZ1CAiD3VA5l6ljSze4aVh90RYuvXmSibx9nPTKE-NobdBqkWL5fR_MX24ZOS8cnHHKM3LGEy9iEivJxi7PazEJ-ZB-2eJl7toQ6F0wvrfOeaziA3ZfazEe-YiQ6EfCs0puXIAVxnhiIn6ACAmhho-kTrhl2uxCM0N_qe2yoMDvDPiu5L_LPgHYtaeqP5WDtOCAAmOvXA-KMh8Rvd0tFJu-1Jp1kPP9Uuj0WO-fof8rwTFyeUEhdORPPbqMA0jJWNgjyZ1m5DvEGYEFpWMubsJIEvIKFfOZT2istMfr0urQ_ZtV3YtPV3EmwFVja1EGe3z9q1aH3G_HiJ5K2CItLoVnj_kQBzNg3MZ6O5pcGWRMvPpUvS4dNZJ4oFVXOy-2TlOewgz4CzNVHHR9GRWyYbQ2On1PkseEAv_uN_Ln4OhpOfJR4wfSq';

function decryptP(P) {
  const C = decodeB86(P.slice(1));
  const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...C], arr, 1);
  return dec;
}
const d1 = decryptP(P1);
const d2 = decryptP(P2);
console.log('dec 长度:', d1.length, d2.length);

// 逐字节对比
const diffs = [];
for (let i = 0; i < Math.min(d1.length, d2.length); i++) {
  if (d1[i] !== d2[i]) diffs.push(i);
}
console.log('差异位置总数:', diffs.length);
console.log('差异位置:', diffs.join(','));

// 打印差异区域的字节（前后 8 字节上下文）
console.log('\n=== 差异区域上下文 ===');
const groups = [];
let gstart = diffs[0], gprev = diffs[0];
for (let i = 1; i <= diffs.length; i++) {
  if (i === diffs.length || diffs[i] > gprev + 1) {
    groups.push([gstart, gprev]);
    if (i < diffs.length) gstart = diffs[i];
  }
  gprev = diffs[i];
}
for (const [s, e] of groups) {
  const from = Math.max(0, s - 8), to = Math.min(d1.length, e + 9);
  console.log(`\n[${s}..${e}] (len=${e - s + 1})`);
  console.log('P1:', d1.slice(from, to).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('P2:', d2.slice(from, to).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('     上下文偏移: ' + Array.from({ length: to - from }, (_, i) => (i + from).toString().padStart(3, ' ')).join(' '));
}

// 判断是否为 unix 时间戳（4B 大端）
console.log('\n=== 时间戳检测 ===');
const now = Math.floor(Date.now() / 1000);
console.log('当前 unix:', now, 'hex:', now.toString(16));
// 在 P1/P2 中搜近 24h 的 unix 时间戳 4B 模式（高字节 0x66/0x65 等 2026 年）
const recent = [];
for (const [name, d] of [['P1', d1], ['P2', d2]]) {
  for (let i = 0; i < d.length - 3; i++) {
    const v = (d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3];
    if (v > now - 86400 * 2 && v < now + 86400) {
      recent.push({ name, i, v, hex: v.toString(16) });
    }
  }
}
recent.forEach(r => console.log(`${r.name} @${r.i}: ${r.hex} (=${new Date(r.v * 1000).toISOString()})`));
