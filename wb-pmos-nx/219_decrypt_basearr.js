/**
 * 219_decrypt_basearr.js
 *
 * 从大[225] 解出 nx basearr 明文：
 * 1. nextarr = 大[225].slice(4)
 * 2. basearrEncrypt = nextarr.slice(11+48)（162B）
 * 3. 内层解密：encryptMode2(basearrEncrypt, numarrAddTime(keys17, runTime, ele)[0], 0) = xor(numarrEncrypt(basearr), keys2, 16)
 * 4. xor keys2 → numarrEncrypt(basearr)
 * 5. 反向 huffman 解码 → basearr 明文
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

// ---- huffman 树（与 numarrEncrypt 相同） ----
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
// 构建 字节->编码bit 映射
function buildEncodeMap() {
  const tree = getTree();
  const map = {};
  function walk(node, bits) {
    if (node.idx !== undefined) { map[node.idx] = bits; return; }
    walk(node.first, bits + '0');
    walk(node.second, bits + '1');
  }
  walk(tree, '');
  return map;
}

// ---- 反向 huffman 解码 ----
function numarrDecrypt(bytes) {
  const tree = getTree();
  // 转 bit 串（忽略最后 padding 位——numarrEncrypt 用 pad 常量填充）
  let bits = '';
  for (let i = 0; i < bytes.length; i++) {
    bits += bytes[i].toString(2).padStart(8, '0');
  }
  const out = [];
  let node = tree;
  let consumed = 0;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    consumed = i;
    if (node && node.idx !== undefined) {
      out.push(node.idx);
      node = tree;
    }
  }
  return out;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');
  const xor = parser.xor;

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  // 明文大[225]
  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  const uuid = plain.slice(0, 4);
  const nextarr = plain.slice(4);
  console.log('nextarr len:', nextarr.length);
  console.log('nextarr 前 16:', nextarr.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('nextarr[0]:', nextarr[0], 'nextarr[1]:', nextarr[1]);

  // keys2（纯算法）
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));
  console.log('keys2:', keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 定位 keys2 在 nextarr 的位置
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  console.log('keys2@nextarr:', k2pos);
  const head = nextarr.slice(0, k2pos);
  const basearrEncrypt = nextarr.slice(k2pos + 48);
  console.log('head:', head.length, 'B:', head.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('basearrEncrypt:', basearrEncrypt.length, 'B');

  // runTime（外层解出的）
  const runTime = 1785416991;
  console.log('runTime:', runTime, new Date(runTime * 1000).toISOString());

  // keys17 候选（jsdom 抓的）
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const k17s = dedup.filter(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12);
  console.log('keys17 候选:', k17s.length);

  for (const [ki, k17] of k17s.entries()) {
    try {
      const arr = numarrAddTime([...k17], runTime, 1 / 256)[0];
      const X = encryptMode2([...basearrEncrypt], arr, 0);
      if (X.length < 10) { console.log('k17#' + ki, '解密过短', X.length); continue; }
      const enc = xor(X, keys2, 16);
      // 验证：numarrEncrypt(明文) == enc？反向解
      const plain2 = numarrDecrypt(enc);
      console.log('\nk17#' + ki, ':', k17.map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  X:', X.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  enc:', enc.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  解码 basearr 明文:', plain2.length, 'B 前 20:', plain2.slice(0, 20).join(','));
      console.log('  首字节:', plain2[0]);
      // 检查是否 numarrJoin 结构（段头 3/1/10/7/0/6/2/9/13）
      const segs = [];
      let p = 0;
      while (p < plain2.length && segs.length < 20) {
        const h = plain2[p];
        if (h < 16 && p + 1 < plain2.length) {
          const l = plain2[p + 1];
          segs.push([h, l, p]);
          p += 2 + l;
        } else break;
      }
      if (segs.length) console.log('  段结构:', segs.map(s => '[' + s[0] + ']len=' + s[1] + '@' + s[2]).join(' '));
      if (plain2[0] === 3 || plain2[0] === 2) {
        fs.writeFileSync(path.join(OUT, 'basearr_jsdom_plain_' + ki + '.json'), JSON.stringify({ k17, runTime, basearr: plain2, enc }));
        console.log('  ★ 已保存 basearr_jsdom_plain_' + ki + '.json');
      }
    } catch (e) {
      console.log('k17#' + ki, '错误:', e.message.substring(0, 50));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
