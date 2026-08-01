/**
 * 167_verify_iv_basestr.js
 *
 * 验证 IV = 0x80000001 重复（random=0.5 hook → random int=2147483647）
 * 用 cookie 前 22 字符（IV 编码）反推 basestr 前 16 字节映射 → 验证无冲突
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

function numToNumarr4(v) {
  // 管线实现（模拟）
  v = v >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}

function numarr2string(numarr, basestr) {
  const keys = basestr.split('');
  let idx = 0;
  const ans = [];
  while (idx < numarr.length - 2) {
    const [one, two, three] = [numarr[idx], numarr[idx + 1], numarr[idx + 2]];
    idx += 3;
    ans.push(keys[one >> 2], keys[((one & 3) << 4) | (two >> 4)], keys[((two & 15) << 2) | (three >> 6)], keys[three & 63]);
  }
  return ans.join('');
}

(async () => {
  // 读确定性 cookie（165 号 hook 全固定）
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('det_cookie_')).sort();
  // 优先最新的
  const d = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const pCookie = d.pCookie;
  const payload = pCookie.startsWith('0') ? pCookie.slice(1) : pCookie;
  console.log('cookie 前 22 字符:', payload.substring(0, 22));

  // 计算 IV（random=0.5 → random int = floor(0.5*4294967295) = 2147483647）
  // IV int = 4294967296 - 2147483647 = 2147483649 = 0x80000001
  const ivInt = (4294967296 - 2147483647) % 4294967296;
  console.log('IV int:', ivInt.toString(16));
  const ivBytes = [];
  for (let i = 0; i < 4; i++) ivBytes.push(...numToNumarr4(ivInt));
  console.log('IV bytes:', ivBytes.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 编码 IV → 期望字符
  // 反推 basestr：IV 字节分组 → 索引 → cookie 字符
  const idxs = [];
  for (let i = 0; i + 2 < ivBytes.length; i += 3) {
    const b0 = ivBytes[i], b1 = ivBytes[i + 1], b2 = ivBytes[i + 2];
    idxs.push(b0 >> 2, ((b0 & 3) << 4) | (b1 >> 4), ((b1 & 15) << 2) | (b2 >> 6), b2 & 63);
  }
  console.log('IV 分组索引:', idxs.join(','), '(共' + idxs.length + '个)');

  const map = {};
  let conflict = 0;
  for (let j = 0; j < idxs.length && j < payload.length; j++) {
    const c = payload[j];
    if (map[idxs[j]] !== undefined && map[idxs[j]] !== c) { conflict++; console.log('冲突 idx=' + idxs[j] + ':', map[idxs[j]], 'vs', c); }
    map[idxs[j]] = c;
  }
  console.log('冲突数:', conflict);
  if (conflict === 0) {
    console.log('★★★ IV=0x80000001 验证通过! 反推 basestr:');
    const bs = [];
    for (let i = 0; i < 64; i++) bs.push(map[i] !== undefined ? map[i] : '?');
    console.log('已知 ' + Object.keys(map).length + '/64:', bs.join(''));
    const knownEntries = Object.entries(map).map(([k, v]) => k + '=' + v).join(' ');
    console.log('映射:', knownEntries);
    fs.writeFileSync(path.join(OUT, 'nx_basestr_partial.json'), JSON.stringify({ map, known: Object.keys(map).length }));
  } else {
    console.log('IV 假设不对——尝试其他 IV 模式');
    // 尝试 IV = random 直接（不 mod）或 0x7FFFFFFF
    const candidates = {
      '0x7FFFFFFF': [0x7fffffff, 0x7fffffff, 0x7fffffff, 0x7fffffff],
      'random_int': [2147483647, 2147483647, 2147483647, 2147483647],
      '0': [0, 0, 0, 0],
    };
    for (const [label, ints] of Object.entries(candidates)) {
      const b = [];
      for (const v of ints) b.push(...numToNumarr4(v));
      const idx = [];
      for (let i = 0; i + 2 < b.length; i += 3) {
        const x0 = b[i], x1 = b[i + 1], x2 = b[i + 2];
        idx.push(x0 >> 2, ((x0 & 3) << 4) | (x1 >> 4), ((x1 & 15) << 2) | (x2 >> 6), x2 & 63);
      }
      const mp = {};
      let cf = 0;
      for (let j = 0; j < idx.length && j < payload.length; j++) {
        const c = payload[j];
        if (mp[idx[j]] !== undefined && mp[idx[j]] !== c) cf++;
        mp[idx[j]] = c;
      }
      console.log(label, ':', '冲突=' + cf, '已知=' + Object.keys(mp).length);
      if (cf === 0) {
        const bs2 = [];
        for (let i = 0; i < 64; i++) bs2.push(mp[i] !== undefined ? mp[i] : '?');
        console.log('  ★ basestr:', bs2.join(''));
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
