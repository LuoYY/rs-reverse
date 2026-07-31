/**
 * 13_crack_prefix.js
 *
 * 破解 13B 会话前缀。候选来源：
 *   1. O cookie 解码（basestr）
 *   2. P cookie 解码（keys16 解密）
 *   3. keys 组合哈希
 *   4. 前缀 = keys2 XOR mask / keys2 某切片
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeBase(str) {
  const idxmap = {};
  for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const payload = str.startsWith('0') ? str.slice(1) : str;
  const bytes = [];
  let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 1 < payload.length) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]];
    bytes.push((c0 << 2) | (c1 >> 4));
  }
  return bytes;
}

function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}

require('module-alias')(path.join(__dirname, '..'));
const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
require('@src/handler/parser/constData').init();

const files = fs.readdirSync(OUT).filter(f => f.startsWith('everything_') && f.endsWith('.json'));
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  const enc24 = (d.encLog || []).filter(c => c.resultType === 'arr[32]' && (c.args || []).join(',').includes('arr[24]'));
  if (!enc24.length) continue;
  const plain = enc24[0].arg0;
  const prefix = plain.slice(0, 13);
  const key21 = enc24[0].arg1;
  const ele = key21[20];
  const keys17 = key21.slice(0, 16).map(b => b ^ ele);
  const keys2 = d.keys30[2].d;
  const keys16 = d.keys30[16].d;
  const oCookie = d.cookies.find(c => c.name.endsWith('O'));
  const pCookie = d.cookies.find(c => c.name.endsWith('P'));

  console.log(`\n=== ${f} ===`);
  console.log('prefix13:', prefix.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys17  :', keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys16  :', keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys2   :', keys2.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 1. O cookie 解码
  if (oCookie) {
    const oBytes = decodeBase(oCookie.value);
    console.log('\nO cookie len=' + oCookie.value.length + ' 解码 ' + oBytes.length + 'B:');
    console.log('  ', oBytes.slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));
    // 检查前缀是否出现在 O 解码中
    for (let off = 0; off + 13 <= oBytes.length; off++) {
      if (oBytes.slice(off, off + 13).every((b, i) => b === prefix[i])) {
        console.log('  ★★★ 前缀出现在 O cookie 解码 @偏移 ' + off);
      }
    }
    // O 解码是否包含 keys2 / keys17
    for (let off = 0; off + 16 <= oBytes.length; off++) {
      if (oBytes.slice(off, off + 16).every((b, i) => b === keys17[i])) console.log('  keys17 出现在 O @' + off);
    }
    // 各种哈希
    const hashes = {
      'md5(Odec)': [...crypto.createHash('md5').update(Buffer.from(oBytes)).digest()],
      'sha1(Odec)': [...crypto.createHash('sha1').update(Buffer.from(oBytes)).digest()].slice(0, 16),
      'md5(Ostr)': [...crypto.createHash('md5').update(oCookie.value).digest()],
      'crc32(Odec)': (() => { const c = crc32b(Buffer.from(oBytes)); return [(c>>>24)&255,(c>>>16)&255,(c>>>8)&255,c&255]; })(),
    };
    for (const [hn, hv] of Object.entries(hashes)) {
      const match = hv.slice(0, 13).every((b, i) => b === prefix[i]);
      console.log(`  ${hn}: ${hv.slice(0,13).map(b=>b.toString(16).padStart(2,'0')).join(' ')} ${match ? '★前缀匹配!' : ''}`);
    }
    // O 解码 XOR keys2 / keys17
    const ox2 = oBytes.slice(0, 16).map((b, i) => b ^ keys2[i]);
    console.log('  O[0:16]^keys2[0:16]:', ox2.map(b => b.toString(16).padStart(2, '0')).join(' '));
    const ox17 = oBytes.slice(0, 16).map((b, i) => b ^ keys17[i]);
    console.log('  O[0:16]^keys17[0:16]:', ox17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  }

  // 2. P cookie 解码
  if (pCookie) {
    const pBytes = decodeBase(pCookie.value);
    console.log('\nP cookie len=' + pCookie.value.length + ' 解码 ' + pBytes.length + 'B');
    // 用 keys16 解密（flag=1，带 IV）
    try {
      const dec = encryptMode2([...pBytes], [...keys16], 1);
      console.log('  P 解密 nextarr: ' + dec.length + 'B');
      console.log('    ', dec.slice(0, 48).map(b => b.toString(16).padStart(2, '0')).join(' '));
      // 前缀匹配？
      for (let off = 0; off + 13 <= dec.length; off++) {
        if (dec.slice(off, off + 13).every((b, i) => b === prefix[i])) {
          console.log('  ★★★ 前缀出现在 P 解密 @偏移 ' + off);
        }
      }
      // nextarr 内应该含 keys2
      for (let off = 0; off + 16 <= dec.length; off++) {
        if (dec.slice(off, off + 16).every((b, i) => b === keys2[i])) console.log('  keys2 出现在 P 解密 @' + off);
      }
    } catch (e) { console.log('  P 解密失败:', e.message.substring(0, 50)); }
  }

  // 3. prefix XOR keys2 的差值模式分析
  const diff = prefix.map((b, i) => b ^ keys2[i]);
  console.log('\nprefix^keys2[0:13]:', diff.map(b => b.toString(16).padStart(2, '0')).join(' '));
  const diff17 = prefix.map((b, i) => b ^ keys17[i]);
  console.log('prefix^keys17[0:13]:', diff17.map(b => b.toString(16).padStart(2, '0')).join(' '));
}

process.exit(0);
