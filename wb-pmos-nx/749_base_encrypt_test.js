/**
 * 749_base_encrypt_test.js
 * 测试 base(179开头, 服务器接受) 是否 = 各种加密(明文 basearr)
 * 候选：encryptMode1/2(cap/b86[2:], keys16/17/2)
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
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

(async () => {
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode1, encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const numarrAlterByNumber = require(path.join(ROOT, 'src/handler/parser/common/numarrAlterByNumber'));

  const d = JSON.parse(fs.readFileSync('/tmp/nx_747_data.json', 'utf8'));
  const cap = d.cap, base = d.base, b86 = d.b86, keys2 = d.keys2;
  const b86slice = b86.slice(2, 2 + cap.length);

  // keys16/17（从 747 数据无法直接派生 keys17，用 743 的 deriveKeys）
  function makeDecryptKeys(bs) {
    return bs.split('').reduce((ans, key, idx) => {
      const code = key.charCodeAt();
      ans[0][code] = idx << 2; ans[1][code] = idx >> 4;
      ans[2][code] = (idx & 15) << 4; ans[3][code] = idx >> 2;
      ans[4][code] = (idx & 3) << 6; ans[5][code] = idx;
      return ans;
    }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
  }
  function decryptCd(cd) {
    const dk = makeDecryptKeys(NX_BS);
    const [d1, d2, d3, d4, d5, d6] = dk;
    const arr2 = [];
    for (let i = 0; i < cd.length; i += 4) {
      const one = cd[i].charCodeAt();
      const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
      const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
      const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
      two !== undefined && arr2.push(d1[one] | d2[two]);
      three !== undefined && arr2.push(d3[two] | d4[three]);
      four !== undefined && arr2.push(d5[three] | d6[four]);
    }
    return arr2;
  }
  function deriveKeys(cdArr) {
    const end = (cdArr[0] << 8 | cdArr[1]) + 2;
    const tail = cdArr.slice(end);
    function getLensGo(numarr, idx) {
      const item = numarr[idx]; idx++;
      let lens;
      if ((item & 128) === 0) lens = item;
      else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
      else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
      else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
      else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
      else lens = item;
      return [lens, idx];
    }
    for (let k0 = 0; k0 <= 127; k0++) {
      for (let k1 = 0; k1 <= 127; k1++) {
        const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48];
        const ans = tail.map((b, i) => b ^ off[i % 8]);
        if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
        if (ans.some(v => v > 255)) continue;
        const keys = [];
        let op = 1, gap, ok = true;
        for (let i = 0; i < ans[0]; i++) {
          [gap, op] = getLensGo(ans, op);
          if (gap < 0 || op + gap > ans.length) { ok = false; break; }
          keys.push(ans.slice(op, op + gap));
          op += gap;
        }
        if (!ok) continue;
        const k16 = keys[16];
        if (k16 && k16.length === 16 && k16.every((v, i) => v === [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173][i])) return { off, keys };
      }
    }
    return null;
  }
  const der = deriveKeys(decryptCd(d.cd));
  if (!der) { console.log('keys 派生失败'); process.exit(1); }
  const k16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const k16a = numarrAddTime([...k16], 0, 1 / 256)[0];
  const k17a = numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
  const k2a = numarrAddTime([...keys2], 0, 1 / 256)[0];

  console.log('base[0-15]:', base.slice(0, 16).join(','));
  console.log('cap[0-15]:', cap.slice(0, 16).join(','));

  // 测试各种加密
  const tests = [
    ['enc1(cap,k17,0)', () => encryptMode1([...cap], k17a, 0)],
    ['enc1(cap,k17,1)', () => encryptMode1([...cap], k17a, 1)],
    ['enc1(cap,k16,0)', () => encryptMode1([...cap], k16a, 0)],
    ['enc1(cap,k2,0)', () => encryptMode1([...cap], k2a, 0)],
    ['enc2(cap,k17,0)', () => encryptMode2([...cap], k17a, 0)],
    ['enc2(cap,k16,1)', () => encryptMode2([...cap], k16a, 1)],
    ['enc1(b86slice,k17,0)', () => encryptMode1([...b86slice], k17a, 0)],
    ['enc2(b86slice,k17,0)', () => encryptMode2([...b86slice], k17a, 0)],
    ['alter(cap,k16)', () => numarrAlterByNumber([...cap], k16)],
  ];
  for (const [name, fn] of tests) {
    try {
      const out = fn();
      let match16 = 0;
      for (let i = 0; i < Math.min(16, out.length); i++) if (out[i] === base[i]) match16++;
      let matchAll = 0;
      for (let i = 0; i < Math.min(out.length, base.length); i++) if (out[i] === base[i]) matchAll++;
      console.log(`${name}: len=${out.length} 前16匹配=${match16}/16 全长匹配=${matchAll}/${Math.min(out.length, base.length)}`);
      if (matchAll > 5) console.log(`  ★ 输出[0-15]: ${out.slice(0, 16).join(',')}`);
    } catch (e) { console.log(name + ': ERR ' + e.message.substring(0, 40)); }
  }
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
