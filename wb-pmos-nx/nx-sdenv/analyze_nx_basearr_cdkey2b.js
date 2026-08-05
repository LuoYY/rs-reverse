// 用修复后的 cdBasestr 解密 sdenv cookie 完整 basearr（317B?）
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const crypto = require('crypto');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// cdBasestr（nx 专用）
const CD_BS = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^";
function numarr2stringDecode(str) {
  const idxmap = {};
  CD_BS.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
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
// cookie 解码 basestr（86 前 64）
const CK_BS = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{";
function numarr2stringDecodeCK(str) {
  const idxmap = {};
  CK_BS.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
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
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom.window.$_ts.nsd;
  const cd = String(dom.window.$_ts.cd);
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
  dom.window.close();
  const P = cookies.split(';')[1].split('=')[1].trim();
  console.log('nsd:', nsd, 'P len:', P.length);

  // cd 解析 keys（cdBasestr）
  const cdArr = numarr2stringDecode(cd);
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
  function genKeysSim(ans) {
    const keys = [];
    let op = 1, gap;
    try {
      for (let i = 0; i < ans[0]; i++) {
        [gap, op] = getLensGo(ans, op);
        if (gap < 0 || op + gap > ans.length) return null;
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
    } catch (e) { return null; }
    return keys;
  }
  let offset = null, cdKeys = null;
  for (let k0 = 0; k0 <= 127 && !offset; k0++) {
    for (let k1 = 0; k1 <= 127 && !offset; k1++) {
      const off = [tail[0]^51, tail[1]^2, tail[2]^k0, tail[3]^k1, tail[4]^2, tail[5]^k0, tail[6]^k1, tail[7]^48];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] === 51 && ans[1] === 2 && ans[4] === 2 && ans[7] === 48) {
        const keys = genKeysSim(ans);
        if (keys && keys.length > 32 && keys[2] && keys[2].length === 48 && [29,30,31,32].every(k => keys[k] && keys[k].length === 4)) {
          offset = off; cdKeys = keys; break;
        }
      }
    }
  }
  if (!offset) { console.log('deriveOffset failed'); process.exit(1); }
  console.log('offset:', offset.join(','));
  console.log('cd keys[2] 含 >255:', cdKeys[2].filter(v => v > 255));
  console.log('cd keys[16] 含 >255:', cdKeys[16].filter(v => v > 255));
  console.log('cd keys[17]:', cdKeys[17].join(','));

  // 解密 cookie（用 cookie basestr）
  const payload = P.startsWith('a') ? P.slice(1) : P;
  const bytes = numarr2stringDecodeCK(payload);
  console.log('bytes len:', bytes.length, '%16:', bytes.length % 16);
  const ivBytes = bytes.slice(0, 16);
  const enc = bytes.slice(16);
  try {
    const outerDec = aesDecrypt(enc, cdKeys[16], ivBytes);
    const pad = outerDec[outerDec.length - 1];
    const stripped = outerDec.slice(0, outerDec.length - pad);
    console.log('\n外层解密成功! stripped len:', stripped.length);
    console.log('stripped 前16:', stripped.slice(0, 16).join(','));
    const nextarr = stripped.slice(4);
    console.log('nextarr 前12:', nextarr.slice(0, 12).join(','));
    let idx = 2 + 8;
    const keys2len = nextarr[idx]; idx++;
    const cookieK2 = nextarr.slice(idx, idx + keys2len);
    console.log('cookie keys2 == cd keys[2]?', cookieK2.join(',') === cdKeys[2].join(','));
    idx += keys2len;
    let rest = nextarr.slice(idx);
    console.log('rest 前6:', rest.slice(0, 6).join(','), 'rest len:', rest.length);
    let basearrEnc;
    if ((rest[0] & 0x80) === 0x80) {
      const encLen = rest[1] | ((rest[0] & 0x7f) << 8);
      basearrEnc = rest.slice(2, 2 + encLen);
      console.log('hasDebug, encLen:', encLen);
    } else {
      basearrEnc = rest.slice(1, 1 + rest[0]);
      console.log('noDebug, encLen:', rest[0]);
    }
    console.log('basearrEnc len:', basearrEnc.length, '%16:', basearrEnc.length % 16);
    const basearrXor = aesDecrypt(basearrEnc, cdKeys[17], new Array(16).fill(0));
    const pad2 = basearrXor[basearrXor.length - 1];
    const bXor = basearrXor.slice(0, basearrXor.length - pad2);
    const numenc = bXor.map((b, i) => b ^ cookieK2[i % 16]);
    const basearr = numarrDecrypt(numenc);
    console.log('\nbasearr len:', basearr.length);
    console.log('basearr:', basearr.join(','));
    fs.writeFileSync('/tmp/nx_basearr_full3.json', JSON.stringify({ basearr, cookieK2, cdKeys2: cdKeys[2] }));
    console.log('\n已保存 /tmp/nx_basearr_full3.json');
  } catch (e) {
    console.log('解密失败:', e.message);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
