/**
 * 279_compare_rebuilt.js
 *
 * 对比重现 vs 原 nextarr / basearrEncrypt，定位 412 差异
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

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
  const arr = [];
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && arr.push(d1[one] | d2[two]);
    three !== undefined && arr.push(d3[two] | d4[three]);
    four !== undefined && arr.push(d5[three] | d6[four]);
  }
  return arr;
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
      if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) return { off, keys };
    }
  }
  return null;
}
function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < B86_64.length; i++) idxmap[B86_64[i]] = i;
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
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const numarr2string = require('@src/handler/parser/common/numarr2string');

  // 用 fresh 会话
  const freshFiles = fs.readdirSync(OUT).filter(f => f.startsWith('fresh_')).sort();
  const s = JSON.parse(fs.readFileSync(path.join(OUT, freshFiles[freshFiles.length - 1])));
  const baData = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_fresh_' + s.nsd + '.json')));
  const ba = baData.basearr;
  const browserK2 = baData.browserK2;
  const k17 = baData.k17;
  console.log('basearr:', ba.length, 'B');

  // 原 nextarr（从 cookie 解密）
  const cdArr = decryptCd(s.cd);
  const der = deriveKeys(cdArr);
  const C = decodeB86(s.pCookie.slice(1));
  const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...C], arr, 1);
  const origNextarr = dec.slice(4);
  const origHead = origNextarr.slice(0, 11);
  const origFlag = origNextarr[59], origN = origNextarr[60];
  const origLen = origN + ((origFlag & 128) ? ((origFlag & 127) << 8) : 0);
  const origBase = origNextarr.slice(61, 61 + origLen);
  console.log('原 basearrEncrypt:', origBase.length, 'B');

  // 重现 basearrEncrypt
  const E = numarrEncrypt([...ba]);
  const X = E.slice();
  for (let i = 0; i < 16 && i < X.length; i++) X[i] ^= browserK2[i];
  const arr17 = numarrAddTime([...k17], 0, 1 / 256)[0];
  const rebuiltBase = encryptMode1([...X], arr17, 0);
  console.log('重现 basearrEncrypt:', rebuiltBase.length, 'B');

  // 对比
  const same = rebuiltBase.length === origBase.length && rebuiltBase.every((v, i) => v === origBase[i]);
  console.log('basearrEncrypt 一致:', same ? '★★★ YES' : 'NO');
  if (!same) {
    let fd = -1;
    for (let i = 0; i < Math.min(rebuiltBase.length, origBase.length); i++) if (rebuiltBase[i] !== origBase[i]) { fd = i; break; }
    console.log('首个差异 @', fd);
    console.log('orig  @差异:', origBase.slice(Math.max(0, fd - 4), fd + 8).join(','));
    console.log('rebuilt@差异:', rebuiltBase.slice(Math.max(0, fd - 4), fd + 8).join(','));
    // E 对比
    const origE = (() => { const arr2 = numarrAddTime([...k17], 0, 1 / 256)[0]; const X2 = encryptMode2([...origBase], arr2, 0); for (let i = 0; i < 16 && i < X2.length; i++) X2[i] ^= browserK2[i]; return X2; })();
    console.log('orig E:', origE.length, 'B 前 8:', origE.slice(0, 8).join(','));
    console.log('my E  :', E.length, 'B 前 8:', E.slice(0, 8).join(','));
    let ed = -1;
    for (let i = 0; i < Math.min(origE.length, E.length); i++) if (origE[i] !== E[i]) { ed = i; break; }
    console.log('E 差异 @', ed);
  }

  // 重现整个 nextarr + cookie（随机 IV）对比
  const flag2 = 128 | (rebuiltBase.length >> 8);
  const N2 = rebuiltBase.length & 255;
  const nx = [...origHead, 48, ...browserK2, flag2, N2, ...rebuiltBase];
  console.log('\nnextarr 一致:', nx.length === origNextarr.length && nx.every((v, i) => v === origNextarr[i]) ? '★★★ YES' : 'NO');
  if (nx.length === origNextarr.length) {
    let nd = -1;
    for (let i = 0; i < nx.length; i++) if (nx[i] !== origNextarr[i]) { nd = i; break; }
    console.log('nextarr 差异 @', nd);
    console.log('  orig:', origNextarr.slice(Math.max(0, nd - 4), nd + 8).join(','));
    console.log('  mine:', nx.slice(Math.max(0, nd - 4), nd + 8).join(','));
  } else {
    console.log('nextarr 长度:', nx.length, 'vs', origNextarr.length);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
