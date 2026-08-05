// 多次生成 nx cookie，解密 basearr，对比稳定段/变化段（用 sdenv 提取的 keys 解密）
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const crypto = require('crypto');
const { fork } = require('child_process');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

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

// 用 sdenv 提取 keys + 生成 cookie（固定 nsd/cd 一次）
async function genCookieAndKeys(nsd, cd) {
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      window.$_ts = { nsd, cd };
      // 数组陷阱（在 sdenv beforeParse 里）
      const found = window.__found = [];
      const rec = (arr) => {
        if (!arr || typeof arr !== 'object') return;
        let a; try { a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null); } catch (e) { return; }
        if (!a) return;
        if (a.length !== 16 && a.length !== 48) return;
        if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
        if (found.length < 200) found.push([...a]);
      };
      for (const C of [window.Array, window.Uint8Array]) {
        if (!C) continue;
        for (const m of ['slice', 'concat', 'map', 'filter', 'flat', 'subarray']) {
          const o = C.prototype[m];
          if (typeof o === 'function') C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r; };
        }
      }
    },
  });
  const w = dom.window;
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
  const found = w.__found || [];
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
  dom.window.close();
  return { cookies, k16, k17, k2 };
}

// 解密 basearr
function decryptP(P, k16, k17, k2) {
  const payload = P.startsWith('a') ? P.slice(1) : P;
  const bytes = numarr2stringDecode(payload);
  const ivBytes = bytes.slice(0, 16);
  const enc = bytes.slice(16);
  const outerDec = aesDecrypt(enc, k16, ivBytes);
  const pad = outerDec[outerDec.length - 1];
  const stripped = outerDec.slice(0, outerDec.length - pad);
  const nextarr = stripped.slice(4);
  let idx = 2 + 8;
  const keys2len = nextarr[idx]; idx++;
  idx += keys2len;
  let rest = nextarr.slice(idx);
  let basearrEnc;
  if ((rest[0] & 0x80) === 0x80) {
    const encLen = rest[1] | ((rest[0] & 0x7f) << 8);
    basearrEnc = rest.slice(2, 2 + encLen);
  } else {
    basearrEnc = rest.slice(1, 1 + rest[0]);
  }
  const basearrXor = aesDecrypt(basearrEnc, k17, new Array(16).fill(0));
  const pad2 = basearrXor[basearrXor.length - 1];
  const bXor = basearrXor.slice(0, basearrXor.length - pad2);
  const numenc = bXor.map((b, i) => b ^ k2[i % 16]);
  return numarrDecrypt(numenc);
}

(async () => {
  console.log('=== nx basearr 稳定段分析 ===');
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  console.log('nsd:', nsd);

  // 固定 nsd/cd，生成 2 次 cookie 对比 basearr
  const r1 = await genCookieAndKeys(nsd, cd);
  const r2 = await genCookieAndKeys(nsd, cd);
  console.log('r1 keys:', r1.k16 ? 'k16 ok' : 'no k16', r1.k17 ? 'k17 ok' : 'no k17', r1.k2 ? 'k2 ok' : 'no k2');
  if (!r1.k16 || !r1.k17 || !r1.k2) { console.log('keys 提取失败'); process.exit(1); }
  const P1 = r1.cookies.split(';')[1].split('=')[1].trim();
  const P2 = r2.cookies.split(';')[1].split('=')[1].trim();
  const b1 = decryptP(P1, r1.k16, r1.k17, r1.k2);
  const b2 = decryptP(P2, r2.k16, r2.k17, r2.k2);
  console.log('b1 len:', b1.length, 'b2 len:', b2.length);
  if (b1.length !== b2.length) { console.log('长度不同'); process.exit(1); }
  console.log('\nb1:', b1.join(','));
  // 稳定段
  const stable = [], diff = [];
  for (let i = 0; i < b1.length; i++) {
    if (b1[i] === b2[i]) stable.push(i); else diff.push([i, b1[i], b2[i]]);
  }
  console.log('\n稳定字节数:', stable.length, '/', b1.length);
  console.log('稳定段 (连续):');
  let s = stable[0], prev = stable[0];
  for (let i = 1; i <= stable.length; i++) {
    if (i < stable.length && stable[i] === prev + 1) { prev = stable[i]; continue; }
    console.log(`  [${s}:${prev}] len=${prev - s + 1}: ${b1.slice(s, prev + 1).join(',')}`);
    if (i < stable.length) { s = stable[i]; prev = stable[i]; }
  }
  console.log('\n变化段:', JSON.stringify(diff.slice(0, 20)));
  fs.writeFileSync('/tmp/nx_basearr_b1.json', JSON.stringify(b1));
  fs.writeFileSync('/tmp/nx_basearr_b2.json', JSON.stringify(b2));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
