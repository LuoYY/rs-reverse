/**
 * 338_analyze_user_curl.js
 * 离线解码用户 curl 的两个 getGatewayConfig 请求（P cookie + query）
 * 判断：P cookie 是否每次刷新 / nextarr 是否变化 / keys2 是否相同
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

const Q1 = 'awhCaAGAqWx9F1g56i6myJPzyJb7kkVxdYZxLZC2W9FQC2KtRRFJqGqiBa-HUtxEH7T-QOjTuonq0qxE4Im0vEzRavRgo0OFqETsi8ZYkiUkZVNurJCaioA';
const Q2 = 'alqDuGGAqWx9F1g56i6myJPzyJb7kkVxdYZxLZC2W9FQC2KtRRFJqGqiBa-HUtxEH7T-QOjTuonkjrvmPE7-tqeT5ZF6Tn6yi_BzN9Uj_ICpXOes12OkwBq';
const H1 = 'abe38RqAqWx9F1g56i6myJPzyJb7kkVxdYZxLZC2W9FQC2KtRRFJqGqiBa-HUtxEH7T-QOjTuonkmk_7GP4p5M71X31QiaLKThpb_ftzdPKOOTxCyPuEF-G';
const H2 = 'av0b0QqAqWx9F1g56i6myJPzyJb7kkVxdYZxLZC2W9FQC2KtRRFJqGqiBa-HUtxEH7T-QOjTuonceE8Ht7Dm2YhEoYNRL20KXCjUF-a1MokSb5xpUqMHihG';

// 解码 P cookie
function decryptP(P) {
  const C = decodeB86(P.slice(1));
  if (!C) return null;
  const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...C], arr, 1);
  return { dec, nextarr: dec.slice(4), keys2: dec.slice(15, 63), head: dec.slice(0, 15) };
}

const d1 = decryptP(P1);
const d2 = decryptP(P2);
console.log('=== P cookie 解码 ===');
console.log('P1 长度:', P1.length, 'P2 长度:', P2.length);
console.log('P1 head[0..15]:', d1.head.map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('P2 head[0..15]:', d2.head.map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('keys2 相同:', d1.keys2.every((v, i) => v === d2.keys2[i]));
console.log('P1 keys2:', d1.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('P2 keys2:', d2.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
// nextarr 前 11 对比（uuid+长度标记）
console.log('P1 nextarr[0..11]:', d1.nextarr.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('P2 nextarr[0..11]:', d2.nextarr.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
// nextarr 尾部对比（basearr 段）
console.log('nextarr 长度:', d1.nextarr.length, d2.nextarr.length);
const minLen = Math.min(d1.nextarr.length, d2.nextarr.length);
const tail1 = d1.nextarr.slice(minLen - 30);
const tail2 = d2.nextarr.slice(minLen - 30);
console.log('尾部 30B 相同:', tail1.every((v, i) => v === tail2[i]));

// query 解码
function decodeQ(q) {
  const b = decodeB86(q.slice(1));
  if (!b) return null;
  return { crc: b.slice(0, 4), mark: b.slice(4, 7), keys2: b.slice(7, 55), len: b[55], req: b.slice(56, 88) };
}
console.log('\n=== query 解码 ===');
for (const [name, q] of [['Q1(URL)', Q1], ['Q2(URL)', Q2], ['H1(hdr)', H1], ['H2(hdr)', H2]]) {
  const d = decodeQ(q);
  if (d) {
    console.log(`${name}: ${q.length}字符 keys2=${d.keys2.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' ')} req=${d.req.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  } else {
    console.log(`${name}: 解码失败`);
  }
}
