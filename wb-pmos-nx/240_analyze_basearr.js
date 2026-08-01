/**
 * 240_analyze_basearr.js
 *
 * 解密并分析浏览器/jsdom basearr 明文（huffman 验证 + 结构分析）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

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
function numarrEncryptBytes(numarr, pad) {
  const tree = getTree();
  const map = {};
  (function walk(node, bits) { if (node.idx !== undefined) { map[node.idx] = bits; return; } walk(node.first, bits + '0'); walk(node.second, bits + '1'); })(tree, '');
  let bitstr = '';
  for (const b of numarr) bitstr += map[b] || '';
  const out = [];
  let one = 0, two = 0;
  for (const c of bitstr) { one = (one << 1) | +c; two++; if (two === 8) { out.push(one); one = 0; two = 0; } }
  if (two > 0) out.push(one << (8 - two) | (pad >> two));
  return out;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  // ============ 浏览器 ============
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const bk = sync.browserKeys;
  const nf = fs.readdirSync(OUT).filter(x => x.startsWith('browser_nextarr_')).sort().pop();
  const nd = JSON.parse(fs.readFileSync(path.join(OUT, nf)));
  const nextarr = nd.nextarr;
  const K2P = bk.keys2.slice(0, 8);
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const flag = nextarr[k2pos + 48], N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const baseEnc = nextarr.slice(k2pos + 50, k2pos + 50 + len);
  console.log('=== 浏览器 basearrEncrypt', baseEnc.length, 'B ===');
  let X = null;
  try {
    const arr = numarrAddTime([...bk.keys17], 0, 1 / 256)[0];
    X = encryptMode2([...baseEnc], arr, 0);
    console.log('X:', X.length, 'B');
    const E = X.slice();
    for (let i = 0; i < 16 && i < E.length; i++) E[i] ^= bk.keys2[i];
    const ba = numarrDecrypt(E);
    const enc2 = numarrEncryptBytes(ba, 0x68);
    console.log('basearr:', ba.length, 'B 首 8:', ba.slice(0, 8).join(','));
    console.log('huffman 验证:', enc2.slice(0, 16).every((v, i) => v === E[i]) ? '★★★ YES' : 'NO (' + enc2.length + '/' + E.length + ')');
    fs.writeFileSync(path.join(OUT, 'basearr_browser_plain.json'), JSON.stringify({ basearr: ba, E }));
    // 完整 dump
    console.log('浏览器 basearr 完整:', JSON.stringify(ba));
  } catch (e) { console.log('浏览器错误:', e.message.substring(0, 60)); }

  // ============ jsdom ============
  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];
  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  const n2 = plain.slice(4);
  const K2P2 = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P2[i]));
  let k2p2 = -1;
  for (let i = 0; i + 8 <= n2.length; i++) {
    if (n2.slice(i, i + 8).every((v, j) => v === K2P2[j])) { k2p2 = i; break; }
  }
  const flag2 = n2[k2p2 + 48], N2 = n2[k2p2 + 49];
  const len2 = N2 + ((flag2 & 128) ? ((flag2 & 127) << 8) : 0);
  const baseEnc2 = n2.slice(k2p2 + 50, k2p2 + 50 + len2);
  console.log('\n=== jsdom basearrEncrypt', baseEnc2.length, 'B ===');
  try {
    const k17 = [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7];
    const arr2 = numarrAddTime([...k17], 0, 1 / 256)[0];
    const X2 = encryptMode2([...baseEnc2], arr2, 0);
    const E2 = X2.slice();
    for (let i = 0; i < 16 && i < E2.length; i++) E2[i] ^= keys2[i];
    const ba2 = numarrDecrypt(E2);
    const enc22 = numarrEncryptBytes(ba2, 0x68);
    console.log('basearr:', ba2.length, 'B 首 8:', ba2.slice(0, 8).join(','));
    console.log('huffman 验证:', enc22.slice(0, 16).every((v, i) => v === E2[i]) ? '★★★ YES' : 'NO (' + enc22.length + '/' + E2.length + ')');
    console.log('jsdom basearr 完整:', JSON.stringify(ba2));
  } catch (e) { console.log('jsdom 错误:', e.message.substring(0, 60)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
