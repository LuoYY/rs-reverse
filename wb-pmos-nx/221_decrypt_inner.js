/**
 * 221_decrypt_inner.js
 *
 * 精确解密内层 basearr：
 * nextarr = [4][8][X 8B][48][keys2 48B][N][basearrEncrypt N]
 * basearrEncrypt = encryptMode1(xor(numarrEncrypt(basearr), keys2, 16), numarrAddTime(key, runTime, random)[0], 0)
 * 解密 → xor keys2 → huffman 反向 → basearr 明文
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

// ---- huffman（与 numarrEncrypt 一致） ----
function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) {
      if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; }
    }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function numarrDecrypt(bytes) {
  const tree = getTree();
  let bits = '';
  for (let i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, '0');
  const out = [];
  let node = tree;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    if (node && node.idx !== undefined) { out.push(node.idx); node = tree; }
  }
  return out;
}
// 正向编码（验证用）
function numarrEncryptBytes(numarr, pad) {
  const tree = getTree();
  const map = {};
  (function walk(node, bits) { if (node.idx !== undefined) { map[node.idx] = bits; return; } walk(node.first, bits + '0'); walk(node.second, bits + '1'); })(tree, '');
  let bitstr = '';
  for (const b of numarr) bitstr += map[b] || '';
  const out = [];
  let one = 0, two = 0;
  for (const c of bitstr) {
    one = (one << 1) | +c; two++;
    if (two === 8) { out.push(one); one = 0; two = 0; }
  }
  if (two > 0) out.push(one << (8 - two) | (pad >> two));
  return out;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  const nextarr = plain.slice(4);
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));

  // 定位 keys2（前 8 匹配）+ N
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const Npos = k2pos + 48;
  const N = nextarr[Npos];
  const baseEnc = nextarr.slice(Npos + 1, Npos + 1 + N);
  console.log('keys2@' + k2pos, 'N=' + N, 'basearrEncrypt=' + baseEnc.length + 'B');
  console.log('nextarr 剩余:', nextarr.length - (Npos + 1 + N), 'B');
  if (nextarr.length > Npos + 1 + N) {
    console.log('剩余段:', nextarr.slice(Npos + 1 + N, Npos + 1 + N + Math.min(20, nextarr.length)).join(','));
  }

  const runTime = 1785416991;
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const kCands = [['keys16', K16]];
  dedup.filter(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12)
    .forEach((a, i) => kCands.push(['k17#' + i, a]));

  for (const [kname, key] of kCands) {
    try {
      const arr = numarrAddTime([...key], runTime, 1 / 256)[0];
      const X = encryptMode2([...baseEnc], arr, 0);
      if (X.length < 30) { console.log(kname, '解密过短', X.length); continue; }
      // xor keys2 前 16B 循环
      const enc = [];
      for (let i = 0; i < X.length; i++) enc.push(X[i] ^ keys2[i % 16]);
      console.log('\n' + kname, ':', key.map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  X(' + X.length + 'B) 前 16:', X.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  xor后 前 16:', enc.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
      // 反向 huffman
      const dec = numarrDecrypt(enc);
      console.log('  huffman 解码:', dec.length, 'B 前 16:', dec.slice(0, 16).join(','));
      if (dec.length > 50) {
        console.log('  ★ 可能 basearr! 首字节:', dec[0], '第二:', dec[1]);
        // 段结构扫描
        let p = 0, segs = [];
        while (p < dec.length - 2 && segs.length < 30) {
          const h = dec[p];
          if (h > 15) break;
          const l = dec[p + 1];
          segs.push([h, l, p]);
          p += 2 + l;
        }
        console.log('  段结构:', segs.map(s => '[' + s[0] + ']l=' + s[1]).join(' '));
        // 验证：正向 huffman 编码是否 == enc
        const enc2 = numarrEncryptBytes(dec, 0x68);
        console.log('  正向编码匹配:', enc2.length === enc.length && enc2.slice(0, 16).every((v, i) => v === enc[i]) ? 'YES' : 'NO (len ' + enc2.length + ' vs ' + enc.length + ')');
        if (dec[0] === 3 || dec[0] === 2) {
          fs.writeFileSync(path.join(OUT, 'basearr_plain_' + kname.split('#')[0] + '.json'), JSON.stringify({ key: kname, runTime, basearr: dec, enc }));
          console.log('  ★ 已保存 basearr_plain_' + kname + '.json');
        }
      }
    } catch (e) { console.log(kname, '错误:', e.message.substring(0, 50)); }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
