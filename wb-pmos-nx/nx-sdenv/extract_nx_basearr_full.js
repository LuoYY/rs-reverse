// 用 sdenv 完整环境提取 nx basearr（正确 keys 解密）+ 保存
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const crypto = require('crypto');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function numarr2stringDecode(str) {
  const bs = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
  const idxmap = {};
  bs.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
  const numarr = [];
  let i = 0;
  const full = Math.floor(str.length / 4);
  for (let g = 0; g < full; g++) {
    const c0 = idxmap[str[i]], c1 = idxmap[str[i + 1]], c2 = idxmap[str[i + 2]], c3 = idxmap[str[i + 3]];
    i += 4;
    numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - i;
  if (rem === 2) numarr.push((idxmap[str[i]] << 2) | (idxmap[str[i + 1]] >> 4));
  else if (rem === 3) numarr.push((idxmap[str[i]] << 2) | (idxmap[str[i + 1]] >> 4), ((idxmap[str[i + 1]] & 15) << 4) | (idxmap[str[i + 2]] >> 2));
  return numarr;
}
function aesDecrypt(data, key16, ivBytes) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key16), Buffer.from(ivBytes));
  decipher.setAutoPadding(false);
  return [...decipher.update(Buffer.from(data)), ...decipher.final()];
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
function getKey(arr) {
  for (let idx in arr) { if (arr[idx].val >= 8) return arr[idx].key >> arr[idx].val - 8; }
}
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else { arr[tree.idx] = config; }
  return [arr, getKey(arr)];
}
const encryptConfig = getEncryptConfig(getTree());
const codeMap = {};
for (let b = 0; b < 256; b++) {
  const c = encryptConfig[0][b];
  if (!c) continue;
  if (!codeMap[c.val]) codeMap[c.val] = {};
  codeMap[c.val][c.key] = b;
}
function numarrDecrypt(numarr) {
  const ans = [];
  let curLen = 0, curKey = 0;
  for (let i = 0; i < numarr.length; i++) {
    const byte = numarr[i];
    for (let bit = 7; bit >= 0; bit--) {
      const b = (byte >> bit) & 1;
      curKey = (curKey << 1) | b;
      curLen++;
      const m = codeMap[curLen];
      if (m && m[curKey] !== undefined) { ans.push(m[curKey]); curKey = 0; curLen = 0; }
    }
  }
  return ans;
}

(async () => {
  console.log('=== nx basearr 完整提取 ===');
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const w = dom.window;
  // 数组陷阱
  const found = [];
  const rec = (arr) => {
    if (!arr || typeof arr !== 'object') return;
    let a;
    try { a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null); } catch (e) { return; }
    if (!a) return;
    if (a.length !== 16 && a.length !== 48) return;
    if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
    if (found.length < 200) found.push([...a]);
  };
  for (const C of [w.Array, w.Uint8Array]) {
    if (!C) continue;
    for (const m of ['slice', 'concat', 'map', 'filter', 'flat', 'subarray']) {
      const o = C.prototype[m];
      if (typeof o === 'function') {
        C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r; };
      }
    }
  }
  const cookies = await new Promise((resolve) => {
    const t0 = Date.now();
    let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(c); }
      lastLen = pLen;
      if (Date.now() - t0 > 40000) { clearInterval(iv); resolve(c); }
    }, 800);
  });
  // keys 识别
  const c16 = {}, c48 = {};
  for (const a of found) {
    const key = a.join(',');
    if (a.length === 16) c16[key] = (c16[key] || 0) + 1;
    if (a.length === 48) c48[key] = (c48[key] || 0) + 1;
  }
  let k16 = null, mx = 0;
  for (const [k, v] of Object.entries(c16)) { if (v > mx) { mx = v; k16 = k.split(',').map(Number); } }
  let k17 = null;
  for (const [k, v] of Object.entries(c16)) {
    const a = k.split(',').map(Number);
    if (k16 && JSON.stringify(a) === JSON.stringify(k16)) continue;
    const t8 = a.slice(8);
    if (t8[1] >= 128 && t8[4] >= 2 && t8[4] <= 7 && t8[6] >= 4 && t8[7] >= 2) { k17 = a; break; }
  }
  let k2 = null, mx48 = 0;
  for (const [k, v] of Object.entries(c48)) { if (v > mx48) { mx48 = v; k2 = k.split(',').map(Number); } }
  console.log('k16:', k16.join(','));
  console.log('k17:', k17.join(','));
  console.log('k2 前8:', k2.slice(0, 8).join(','));

  // 解密 cookie P
  const P = cookies.split(';')[1].split('=')[1].trim();
  const payload = P.startsWith('a') ? P.slice(1) : P;
  const bytes = numarr2stringDecode(payload);
  const ivBytes = bytes.slice(0, 16);
  const enc = bytes.slice(16);
  const outerDec = aesDecrypt(enc, k16, ivBytes);
  const pad = outerDec[outerDec.length - 1];
  const stripped = outerDec.slice(0, outerDec.length - pad);
  console.log('\n外层层 stripped 前20:', stripped.slice(0, 20).join(','));
  const nextarr = stripped.slice(4);
  console.log('nextarr 前20:', nextarr.slice(0, 20).join(','));
  let idx = 0;
  idx += 2 + 8;
  const keys2len = nextarr[idx]; idx++;
  const cookieK2 = nextarr.slice(idx, idx + keys2len);
  console.log('cookie keys2 前8:', cookieK2.slice(0, 8).join(','));
  console.log('sdenv k2 前8 一致?', cookieK2.slice(0, 8).join(',') === k2.slice(0, 8).join(','));
  idx += keys2len;
  let rest = nextarr.slice(idx);
  console.log('rest 前8:', rest.slice(0, 8).join(','), 'rest len:', rest.length);
  let basearrEnc;
  if ((rest[0] & 0x80) === 0x80) {
    const encLen = rest[1] | ((rest[0] & 0x7f) << 8);
    basearrEnc = rest.slice(2, 2 + encLen);
    console.log('hasDebug, encLen:', encLen);
  } else {
    basearrEnc = rest.slice(1, 1 + rest[0]);
    console.log('noDebug, encLen:', rest[0]);
  }
  console.log('basearrEnc len:', basearrEnc.length);
  const basearrXor = aesDecrypt(basearrEnc, k17, new Array(16).fill(0));
  const pad2 = basearrXor[basearrXor.length - 1];
  const bXor = basearrXor.slice(0, basearrXor.length - pad2);
  const numenc = bXor.map((b, i) => b ^ k2[i % 16]);
  const basearr = numarrDecrypt(numenc);
  console.log('\nbasearr len:', basearr.length);
  console.log('basearr 全部:', basearr.join(','));
  fs.writeFileSync('/tmp/nx_basearr_full.json', JSON.stringify({ basearr, k16, k17, k2: cookieK2 }));
  console.log('\n已保存 /tmp/nx_basearr_full.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
