/**
 * 235_inner_head_time.js
 *
 * 用 head 时间戳（X 8B）作为内层 runTime 解密 basearrEncrypt
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

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  const nextarr = plain.slice(4);
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const head = nextarr.slice(0, k2pos);
  const N = nextarr[k2pos + 48];
  const baseEnc = nextarr.slice(k2pos + 49, k2pos + 49 + N);
  console.log('head:', head.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('basearrEncrypt:', baseEnc.length, 'B');

  // head 时间戳：X = head[2..9]（8B）→ 2 个 int
  const X = head.slice(2, 10);
  const t1 = (X[0] << 24 | X[1] << 16 | X[2] << 8 | X[3]) >>> 0;
  const t2 = (X[4] << 24 | X[5] << 16 | X[6] << 8 | X[7]) >>> 0;
  console.log('head 时间戳 ints:', t1, t2, new Date(t1 * 1000).toISOString(), new Date(t2 * 1000).toISOString());

  // t 候选
  const tCands = [t1, t2, t1 - 1, t1 + 1, t2 - 1, t2 + 1, 0, 1785580000, Math.floor(Date.now() / 1000)];

  // 密钥候选（重点：纯算法 keys17）
  const kCands = [];
  const der = JSON.parse(fs.readFileSync(path.join(OUT, 'nx_keys_derived.json')));
  der.keys.forEach((k, i) => { if (Array.isArray(k) && k.length >= 16 && k.length <= 64) kCands.push(['keys' + i, k.slice(0, 16)]); });
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  dedup.filter(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12)
    .forEach((a, i) => kCands.push(['jsd' + i, a]));
  // keys2 前 16B
  kCands.push(['keys2p', keys2.slice(0, 16)]);

  console.log('密钥:', kCands.length, 't:', tCands.length);
  for (const [kname, key] of kCands) {
    for (const t of tCands) {
      for (const flag of [0, 1]) {
        try {
          const arr = numarrAddTime([...key], t, 1 / 256)[0];
          const Xd = encryptMode2([...baseEnc], arr, flag);
          if (Xd.length < 40) continue;
          for (const mode of ['xorK2', 'raw']) {
            const enc = mode === 'xorK2' ? Xd.map((v, i) => v ^ keys2[i % 16]) : Xd;
            const ba = numarrDecrypt(enc);
            if (ba.length > 100 && (ba[0] === 3 || ba[0] === 2)) {
              console.log('★★★ ' + kname, 't=' + t, 'flag=' + flag, 'mode=' + mode, 'basearr=' + ba.length + 'B');
              console.log('  basearr 前 30:', ba.slice(0, 30).join(','));
              fs.writeFileSync(path.join(OUT, 'basearr_jsdom_final.json'), JSON.stringify({ kname, t, flag, mode, basearr: ba }));
              process.exit(0);
            }
          }
        } catch (e) {}
      }
    }
  }
  console.log('无命中');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
