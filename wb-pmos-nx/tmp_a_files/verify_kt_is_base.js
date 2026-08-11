// 验证：_$kt（200B）是否 = cookie 中的 base 编码（be 段）
// 从 nx_p1.json（本地固定 P cookie）解出 be，对比 _$kt 快照
const writes = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_writes.json');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
function dB64(s) { const m = {}; for (let i = 0; i < 64; i++) m[NX_BS[i]] = i; const o = []; let q = 0; for (let g = 0; g < Math.floor(s.length / 4); g++) { const c0 = m[s[q]], c1 = m[s[q + 1]], c2 = m[s[q + 2]], c3 = m[s[q + 3]]; q += 4; o.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3) } const r = s.length - q; if (r === 2) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4)); else if (r === 3) o.push((m[s[q]] << 2) | (m[s[q + 1]] >> 4), ((m[s[q + 1]] & 15) << 4) | (m[s[q + 2]] >> 2)); return o }

// 从 P cookie 解 be
const p1 = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_p1.json');
const pB = dB64(p1.P.slice(1));
const k16a = parser.numarrAddTime([...K16], 0, 1 / 256)[0];
const dec = parser.encryptMode2([...pB], k16a, 1);
const na = dec.slice(4);
const beLen = (na[59] & 0x7f) << 8 | na[60];
const be = na.slice(61, 61 + beLen);
console.log('P cookie beLen:', beLen, 'be head:', be.slice(0, 10).join(','));

// 对比 _$kt 200B 快照
const kt200 = writes[23].kt; // len=200 首个快照（#23）
console.log('\n_$kt[200] head:', kt200.slice(0, 10).join(','));
console.log('_$kt[200] len:', kt200.length);
console.log('\n=== be vs _$kt XOR ===');
const m = Math.min(be.length, kt200.length);
const xors = [];
for (let i = 0; i < m; i++) xors.push(be[i] ^ kt200[i]);
console.log('be[0:10] =', be.slice(0, 10).join(','));
console.log('kt [0:10] =', kt200.slice(0, 10).join(','));
console.log('XOR[0:10] =', xors.slice(0, 10).join(','));

// 检查 XOR 是否恒定（若恒定 = 直接关系）
const uniq = new Set(xors.slice(0, 40));
console.log('\n前 40 XOR 不同值:', uniq.size);
// 打印不同值
if (uniq.size > 5) console.log('XOR 多变（非简单 XOR）:', [...uniq].slice(0, 8).join(','));
else console.log('★ XOR 恒定?', [...uniq].join(','));
