/**
 * 20_counter_analysis.js
 *
 * 分析 prefix 中的两个单调计数器（mask[10:11] 和 const3[1:2]）的来源
 * 候选：O/P cookie 哈希、nsd、cd、keys 哈希、cp3
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
function md5(...p) { return [...crypto.createHash('md5').update(Buffer.concat(p.map(x => Buffer.from(x)))).digest()]; }
function sha1(...p) { return [...crypto.createHash('sha1').update(Buffer.concat(p.map(x => Buffer.from(x)))).digest()]; }
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

function load(f) {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  const enc24 = (d.encLog || []).filter(c => c.resultType === 'arr[32]' && (c.args || []).join(',').includes('arr[24]'));
  if (!enc24.length || !d.keys30 || !d.keys30[17]) return null;
  const plain = enc24[0].arg0;
  const mask = plain.slice(0, 13).map((b, i) => b ^ d.keys30[2].d[i]);
  return {
    file: f,
    nsd: (d.challenges ? d.challenges[d.challenges.length - 1] : d.challenge)?.nsd || null,
    cd: (d.challenges ? d.challenges[d.challenges.length - 1] : d.challenge)?.cd || null,
    counterA: (mask[10] << 8) | mask[11],
    counterB: (plain[17] << 8) | plain[18],
    keys2: d.keys30[2].d,
    keys17: d.keys30[17].d,
    keys16: d.keys30[16].d,
    oCookie: d.cookies?.find(c => c.name.endsWith('O'))?.value || null,
    pCookie: d.cookies?.find(c => c.name.endsWith('P'))?.value || null,
  };
}

const sessions = [
  'cd_keys_query_1785488187669.json',
  'plaintext_1785488407275.json',
  'everything_1785488791311.json',
  'everything_1785489159074.json',
].map(f => load(f)).filter(Boolean);

console.log('=== 会话 counterA / counterB ===');
for (const s of sessions) {
  console.log(s.file.substring(0, 32), 'nsd=' + s.nsd, 'A=0x' + s.counterA.toString(16), 'B=0x' + s.counterB.toString(16), s.oCookie ? 'O=' + s.oCookie.substring(0, 20) : '');
}

// 对每个有 O cookie 的会话测试
console.log('\n=== counterA/B 候选公式 ===');
for (const s of sessions) {
  if (!s.oCookie) continue;
  const oBytes = decodeBase(s.oCookie);
  const pBytes = decodeBase(s.pCookie);
  const oStr = s.oCookie;
  const cands = {
    'crc32(Ostr)>>16': crc32b(Buffer.from(oStr)) >>> 16,
    'crc32(Ostr)&ffff': crc32b(Buffer.from(oStr)) & 0xffff,
    'crc32(OBytes)>>16': crc32b(Buffer.from(oBytes)) >>> 16,
    'crc32(OBytes)&ffff': crc32b(Buffer.from(oBytes)) & 0xffff,
    'md5(Ostr)低16': (md5(oStr)[0] << 8) | md5(oStr)[1],
    'md5(Ostr)16-17': (md5(oStr)[8] << 8) | md5(oStr)[9],
    'md5(OBytes)低16': (md5(oBytes)[0] << 8) | md5(oBytes)[1],
    'sha1(Ostr)低16': (sha1(oStr)[0] << 8) | sha1(oStr)[1],
    'O解码[0:2]': (oBytes[0] << 8) | oBytes[1],
    'O解码[2:4]': (oBytes[2] << 8) | oBytes[3],
    'O解码[4:6]': (oBytes[4] << 8) | oBytes[5],
    'O解码[8:10]': (oBytes[8] << 8) | oBytes[9],
    'O解码[10:12]': (oBytes[10] << 8) | oBytes[11],
    'O解码[14:16]': (oBytes[14] << 8) | oBytes[15],
    'O解码[16:18]': (oBytes[16] << 8) | oBytes[17],
    'nsd&ffff': s.nsd & 0xffff,
    'crc32(nsd)&ffff': crc32b(Buffer.from(String(s.nsd))) & 0xffff,
    'crc32(cd)&ffff': s.cd ? crc32b(Buffer.from(s.cd)) & 0xffff : null,
    'md5(cd)低16': s.cd ? (md5(s.cd)[0] << 8) | md5(s.cd)[1] : null,
    'md5(cd)16-17': s.cd ? (md5(s.cd)[8] << 8) | md5(s.cd)[9] : null,
    'crc32(keys17)&ffff': crc32b(Buffer.from(s.keys17)) & 0xffff,
    'crc32(keys2)&ffff': crc32b(Buffer.from(s.keys2)) & 0xffff,
    'keys17[0]<<8|keys17[1]': (s.keys17[0] << 8) | s.keys17[1],
    'keys17[8]<<8|keys17[9]': (s.keys17[8] << 8) | s.keys17[9],
    'keys2[8]<<8|keys2[9]': (s.keys2[8] << 8) | s.keys2[9],
  };
  console.log('\n--- ' + s.file.substring(0, 30) + ' (A=0x' + s.counterA.toString(16) + ', B=0x' + s.counterB.toString(16) + ') ---');
  for (const [name, val] of Object.entries(cands)) {
    if (val === null) continue;
    const markA = val === s.counterA ? ' ★★A' : '';
    const markB = val === s.counterB ? ' ★★B' : '';
    if (markA || markB) console.log('  ' + name + ' = 0x' + val.toString(16) + markA + markB);
  }
}

process.exit(0);
