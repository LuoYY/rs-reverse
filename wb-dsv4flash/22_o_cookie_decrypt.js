/**
 * 22_o_cookie_decrypt.js
 *
 * 假设：O cookie（66B 解码）是加密数据，用 keys16/keys17 解密
 * 可能包含 keys2 + 计数器（prefix 的来源）
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
  if (qi + 1 < payload.length) bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi + 1]] >> 4));
  return bytes;
}

require('module-alias')(path.join(__dirname, '..'));
const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
require('@src/handler/parser/constData').init();

for (const f of ['everything_1785488791311.json', 'everything_1785489159074.json']) {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  const oCookie = d.cookies.find(c => c.name.endsWith('O')).value;
  const oBytes = decodeBase(oCookie);
  const keys16 = d.keys30[16].d;
  const keys17 = d.keys30[17].d;
  const keys2 = d.keys30[2].d;
  const enc24 = d.encLog.filter(c => c.resultType === 'arr[32]' && c.args.join(',').includes('arr[24]'));
  const plain = enc24[0].arg0;
  const mask = plain.slice(0, 13).map((b, i) => b ^ keys2[i]);

  console.log('=== ' + f.substring(0, 30) + ' ===');
  console.log('O 解码 ' + oBytes.length + 'B:', oBytes.slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('mask:', mask.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 尝试各种解密
  const combos = [
    ['O-dec keys16 flag0', oBytes, keys16, 0],
    ['O-dec keys16 flag1', oBytes, keys16, 1],
    ['O-dec keys17 flag0', oBytes, keys17, 0],
    ['O-dec keys17 flag1', oBytes, keys17, 1],
    ['O-part1 keys16 flag0', decodeBase(oCookie.split('.')[0] || oCookie), keys16, 0],
  ];
  for (const [name, data, key, flag] of combos) {
    try {
      const dec = encryptMode2(data, key, flag);
      if (dec && dec.length) {
        const ascii = dec.filter(b => b >= 32 && b <= 126).length / dec.length;
        console.log(`  ${name}: ${dec.length}B ASCII=${(ascii*100).toFixed(0)}% [${dec.slice(0, 24).join(',')}]`);
        console.log(`    hex: ${dec.slice(0, 24).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      }
    } catch (e) { console.log(`  ${name}: err ${e.message.substring(0, 40)}`); }
  }
  console.log();
}

// 标准 AES-CBC 对比
console.log('=== 标准 AES-CBC（zero IV）===');
for (const f of ['everything_1785488791311.json', 'everything_1785489159074.json']) {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  const oCookie = d.cookies.find(c => c.name.endsWith('O')).value;
  const oBytes = decodeBase(oCookie);
  const keys16 = d.keys30[16].d;
  const keys17 = d.keys30[17].d;
  for (const [kn, key] of [['keys16', keys16], ['keys17', keys17]]) {
    for (const ivMode of ['zero', 'cbc']) {
      try {
        const cipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key), Buffer.alloc(16, 0));
        cipher.setAutoPadding(false);
        const raw = Buffer.concat([cipher.update(Buffer.from(oBytes.slice(0, 64))), cipher.final()]);
        const last = raw[raw.length - 1];
        console.log(`  ${f.substring(0, 20)} ${kn} ${ivMode}: lastByte=${last} [${[...raw].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' ')}]`);
      } catch (e) {}
    }
  }
}
process.exit(0);
