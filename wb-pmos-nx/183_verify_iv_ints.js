/**
 * 183_verify_iv_ints.js
 *
 * 用 base64url 解码的 IV ints（0x68875d75, 0xde9d75d7, 0x5e75d75d, 0x74875d75）
 * 反推 basestr（确定性 cookie 前 22）→ 验证无冲突
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

function numToNumarr4(v) {
  v = v >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}

(async () => {
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('det_cookie_')).sort();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const payload = d.pCookie.startsWith('0') ? d.pCookie.slice(1) : d.pCookie;
  console.log('cookie 前 22:', payload.substring(0, 22));

  // IV ints（base64url 解码值）
  const ivInts = [0x68875d75, 0xde9d75d7, 0x5e75d75d, 0x74875d75];
  const ivBytes = [];
  for (const v of ivInts) ivBytes.push(...numToNumarr4(v));
  console.log('IV bytes:', ivBytes.map(b => b.toString(16).padStart(2, '0')).join(' '));

  const idxs = [];
  for (let i = 0; i + 2 < ivBytes.length; i += 3) {
    const b0 = ivBytes[i], b1 = ivBytes[i + 1], b2 = ivBytes[i + 2];
    idxs.push(b0 >> 2, ((b0 & 3) << 4) | (b1 >> 4), ((b1 & 15) << 2) | (b2 >> 6), b2 & 63);
  }
  console.log('IV 分组索引:', idxs.join(','));
  const map = {};
  let conflict = 0;
  for (let j = 0; j < idxs.length && j < payload.length; j++) {
    const c = payload[j];
    if (map[idxs[j]] !== undefined && map[idxs[j]] !== c) { conflict++; console.log('冲突 idx=' + idxs[j] + ':', map[idxs[j]], 'vs', c); }
    map[idxs[j]] = c;
  }
  console.log('冲突:', conflict, '已知:', Object.keys(map).length);
  if (conflict === 0) {
    console.log('★★★ 无冲突! basestr 部分:');
    const bs = [];
    for (let i = 0; i < 64; i++) bs.push(map[i] !== undefined ? map[i] : '?');
    console.log(bs.join(''));
    console.log('映射:', Object.entries(map).map(([k, v]) => k + '=' + v).join(' '));
    fs.writeFileSync(path.join(OUT, 'nx_basestr_partial.json'), JSON.stringify({ map, ivInts }));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
