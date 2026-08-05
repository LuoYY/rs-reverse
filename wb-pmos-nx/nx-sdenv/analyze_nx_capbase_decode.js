// 离线分析：从 cap+P 样本解出 base，与 b86 cap 对比，反推 cap→base 的 VM 加密。
// 输入 /tmp/nx_capbase_N.json（cd + P），输出同会话 cap/base 对 + 段映射。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function dB64(s) { const m = {}; for (let i = 0; i < 64; i++)m[NX_BS[i]] = i; const o = []; let q = 0; for (let g = 0; g < Math.floor(s.length / 4); g++) { const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]]; q += 4; if (c0 === undefined) return null; o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3) } const r = s.length - q; if (r === 2) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4)); else if (r === 3) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4), ((m[s[q + 1]] & 15) << 4) | (m[s[q + 2]] >> 2)); return o }
function makeDk(bs) { return bs.split('').reduce((ans, key, idx) => { const c = key.charCodeAt(); ans[0][c] = idx << 2; ans[1][c] = idx >> 4; ans[2][c] = (idx & 15) << 4; ans[3][c] = idx >> 2; ans[4][c] = (idx & 3) << 6; ans[5][c] = idx; return ans }, [{}, {}, {}, {}, {}, { ...new Array(256).fill(-1) }]) }
function decryptCd(cd) { const dk = makeDk(NX_BS); const [d1, d2, d3, d4, d5, d6] = dk; const arr = []; for (let i = 0; i < cd.length; i += 4) { const one = cd[i].charCodeAt(); const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined; const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined; const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined; two !== undefined && arr.push(d1[one] | d2[two]); three !== undefined && arr.push(d3[two] | d4[three]); four !== undefined && arr.push(d5[three] | d6[four]) } return arr }
function gLG(n, idx) { const it = n[idx]; idx++; let l; if ((it & 128) === 0) l = it; else if ((it & 192) === 128) { l = ((it & 63) << 8) | n[idx]; idx++ } else if ((it & 224) === 192) { l = ((it & 31) << 16) | (n[idx] << 8) | n[idx + 1]; idx += 2 } else if ((it & 240) === 224) { l = ((it & 15) << 24) | (n[idx] << 16) | (n[idx + 1] << 8) | n[idx + 2]; idx += 3 } else if ((it & 248) === 240) { l = (n[idx] << 24) | (n[idx + 1] << 16) | (n[idx + 2] << 8) | n[idx + 3]; idx += 4 } else l = it; return [l, idx] }
function deriveKeys(cdArr) { const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); for (let k0 = 0; k0 <= 127; k0++)for (let k1 = 0; k1 <= 127; k1++) { const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48]; const ans = tail.map((b, i) => b ^ off[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; if (ans.some(v => v > 255)) continue; const keys = []; let op = 1, gap, ok = true; for (let i = 0; i < ans[0]; i++) { [gap, op] = gLG(ans, op); if (gap < 0 || op + gap > ans.length) { ok = false; break } keys.push(ans.slice(op, op + gap)); op += gap } if (!ok) continue; const k16 = keys[16]; if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) return { keys } } return null }
function getTree() { let a = []; for (let i = 1; i < 255; i++)a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) { if (it.total <= a[i].total) { a.splice(i, 0, it); return } } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const byLen = {}; let maxL = 0; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val }
function hdecRaw(enc) { const ans = []; let key = 0, val = 0; for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const m = byLen[val]; if (m && m[key] !== undefined) { ans.push(m[key]); key = 0; val = 0 } if (val > maxL) { key = 0; val = 0 } } } return ans }

for (const idx of ['0']) {
  const f = '/tmp/nx_capbase_' + idx + '.json';
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!d.cd || !d.P) { console.log('样本' + idx + ' 缺 cd/P'); continue; }
  const der = deriveKeys(decryptCd(d.cd));
  if (!der) { console.log('样本' + idx + ' deriveKeys 失败'); continue; }
  const keys17 = der.keys[17], keys2 = der.keys[2];
  const k16a = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...dB64(d.P.slice(1))], k16a, 1);
  const na = dec.slice(4);
  const cookieK2 = na.slice(11, 59);
  const k2match = JSON.stringify(keys2) === JSON.stringify(cookieK2);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const k17a = numarrAddTime([...keys17], 0, 1 / 256)[0];
  const tmp = encryptMode2([...be], k17a, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ cookieK2[i]) : v);
  const base = hdecRaw(huff);
  // cap = b86[2:2+base.len]
  const b86 = dB64(d.cd);
  const cap = b86.slice(2, 2 + base.length);
  console.log('=== 样本' + idx + ' nsd=' + d.nsd + ' k2match=' + k2match + ' ===');
  console.log('base.len=' + base.length + ' 头=' + base.slice(0, 8).join(','));
  console.log('base[0:30]:', base.slice(0, 30).join(','));
  console.log('cap[0:30]: ', cap.slice(0, 30).join(','));
  // 段对比：找 cap→base 的恒定/变化映射
  console.log('base[22:29] sess:', base.slice(22, 29).join(','));
  console.log('cap[22:29]:     ', cap.slice(22, 29).join(','));
  // 保存
  fs.writeFileSync('/tmp/nx_capbase_' + idx + '_decoded.json', JSON.stringify({ nsd: d.nsd, cd: d.cd, base, cap, keys17, keys2, cookieK2, be }, null, 1));
  console.log('saved /tmp/nx_capbase_' + idx + '_decoded.json');
}
