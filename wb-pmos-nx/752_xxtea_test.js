/**
 * 752_xxtea_test.js
 * 测试 base = XXTEA_encrypt(明文 basearr, key)？
 * 明文候选：cap、b86[2:169]（标记替换）
 * 密钥候选：keys16/17/2
 */
const fs = require('fs');
const path = require('path');

function bytesToU32(bytes, LE = false) {
  const r = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    if (LE) r.push(((bytes[i]) | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0);
    else r.push(((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0);
  }
  return r;
}
function u32ToBytes(arr, LE = false) {
  const b = [];
  for (const v of arr) {
    if (LE) b.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
    else b.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF);
  }
  return b;
}
function xxteaEncrypt(v, key) {
  const n = v.length; if (n < 2) return v;
  const DELTA = 0x9E3779B9;
  let q = Math.floor(6 + 52 / n), sum = 0, y = v[0], z, p, e;
  while (q-- > 0) {
    sum = (sum + DELTA) >>> 0;
    e = (sum >>> 2) & 3;
    for (p = 0; p < n - 1; p++) {
      z = v[p + 1];
      const mx = (((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z));
      y = v[p] = (v[p] + mx) >>> 0;
    }
    z = v[0];
    const mx = (((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[0 ^ e] ^ z));
    y = v[n - 1] = (v[n - 1] + mx) >>> 0;
  }
  return v;
}
function xxteaDecrypt(v, key) {
  const n = v.length; if (n < 2) return v;
  const DELTA = 0x9E3779B9;
  let q = Math.floor(6 + 52 / n), sum = (q * DELTA) >>> 0, y, z = v[n - 1];
  while (sum !== 0) {
    const e = (sum >>> 2) & 3;
    for (let p = n - 1; p > 0; p--) {
      z = v[p - 1]; y = v[p];
      const mx = (((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z));
      v[p] = (v[p] - mx) >>> 0;
    }
    z = v[n - 1]; y = v[0];
    const mx = (((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[0 ^ e] ^ z));
    v[0] = (v[0] - mx) >>> 0;
    sum = (sum - DELTA) >>> 0;
  }
  return v;
}

(async () => {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_747_data.json', 'utf8'));
  const cap = d.cap, base = d.base, keys2 = d.keys2;
  console.log('cap len:', cap.length, 'base len:', base.length);

  // 密钥候选
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const keyCands = {
    'K16': K16,
    'keys2': keys2.slice(0, 16),
  };

  // 明文候选
  const plainCands = {
    'cap': cap,
    'cap前166': cap.slice(0, 166),
  };

  // 测试：base = XXTEA(明文) 各种 endian
  for (const [pn, plain] of Object.entries(plainCands)) {
    for (const [kn, key] of Object.entries(keyCands)) {
      for (const be of ['BE', 'LE']) {
        try {
          const pu = bytesToU32(plain, be === 'LE');
          const ku = bytesToU32(key, be === 'LE');
          // 补到 4 倍数
          while (plain.length % 4) plain.push(0);
          const enc = u32ToBytes(xxteaEncrypt(bytesToU32(plain, be === 'LE'), ku), be === 'LE');
          let m = 0;
          for (let i = 0; i < Math.min(enc.length, base.length); i++) if (enc[i] === base[i]) m++;
          console.log(`XXTEA(${pn},${kn},${be}): len=${enc.length} 匹配=${m}/${Math.min(enc.length, base.length)}`);
          if (m > 5) console.log(`  enc[0-15]: ${enc.slice(0, 16).join(',')}`);
        } catch (e) { console.log(`XXTEA(${pn},${kn},${be}): ERR ${e.message.substring(0, 30)}`); }
      }
    }
  }

  // 反向：base 是否 = XXTEA 加密的 keys 或固定数据
  console.log('\n=== base XXTEA 解密尝试（看是否解出可读数据）===');
  for (const [kn, key] of Object.entries(keyCands)) {
    for (const be of ['BE', 'LE']) {
      try {
        const bu = bytesToU32(base, be === 'LE');
        const ku = bytesToU32(key, be === 'LE');
        const dec = xxteaDecrypt([...bu], ku);
        const bytes = u32ToBytes(dec, be === 'LE');
        const ascii = bytes.filter(b => b >= 32 && b <= 126).length / bytes.length;
        console.log(`XXTEA解密(base,${kn},${be}): len=${bytes.length} ascii率=${(ascii * 100).toFixed(1)}% [0-15]=${bytes.slice(0, 16).join(',')}`);
      } catch (e) {}
    }
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
