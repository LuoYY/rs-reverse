// 固定 keys 解密多个 cookie，对比 basearr 稳定段
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

async function genCookieOnce(nsd, cd) {
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) { window.$_ts = { nsd, cd }; },
  });
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
  return cookies;
}

// 从 cookie 提取 keys（nextarr 里的 keys2）
function extractKeysFromP(P, k16) {
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
  const k2 = nextarr.slice(idx, idx + keys2len);
  return { stripped, nextarr, k2 };
}

(async () => {
  console.log('=== basearr 稳定段 v2 ===');
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  console.log('nsd:', nsd);

  // 提取 keys（用 jsdom_keys_child）
  const { fork } = require('child_process');
  const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const kms = await new Promise((resolve) => {
    const child = fork(path.join(__dirname, 'jsdom_keys_child.js'), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 25000);
    child.on('message', (m) => { clearTimeout(timer); resolve(m); });
    child.send({ nsd, cd, outerJsPath: OUTER_JS });
  });
  if (!kms || !kms.keys2) { console.log('keys 提取失败'); process.exit(1); }
  console.log('k16:', kms.keys16.join(','));
  console.log('k17:', kms.keys17.join(','));
  console.log('k2:', kms.keys2.join(','));

  // 生成 2 个 cookie，用固定 keys 解密 basearr
  const c1 = await genCookieOnce(nsd, cd);
  const c2 = await genCookieOnce(nsd, cd);
  const P1 = c1.split(';')[1].split('=')[1].trim();
  const P2 = c2.split(';')[1].split('=')[1].trim();

  function decryptBasearr(P, k16, k17, k2) {
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
    const cookieK2 = nextarr.slice(idx, idx + keys2len);
    console.log('  cookie keys2 前4 == k2 前4?', cookieK2.slice(0, 4).join(',') === k2.slice(0, 4).join(','));
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
    const numenc = bXor.map((b, i) => b ^ cookieK2[i % 16]);
    return { basearr: numarrDecrypt(numenc), cookieK2 };
  }

  const r1 = decryptBasearr(P1, kms.keys16, kms.keys17, kms.keys2);
  const r2 = decryptBasearr(P2, kms.keys16, kms.keys17, kms.keys2);
  const b1 = r1.basearr, b2 = r2.basearr;
  console.log('\ncookie keys2 一致?', r1.cookieK2.join(',') === r2.cookieK2.join(','));
  console.log('b1 len:', b1.length, 'b2 len:', b2.length);
  console.log('b1:', b1.join(','));
  if (b1.length !== b2.length) { console.log('长度不同'); process.exit(0); }
  const stable = [], diff = [];
  for (let i = 0; i < b1.length; i++) {
    if (b1[i] === b2[i]) stable.push(i); else diff.push([i, b1[i], b2[i]]);
  }
  console.log('\n稳定字节:', stable.length, '/', b1.length);
  let s = stable[0], prev = stable[0];
  for (let i = 1; i <= stable.length; i++) {
    if (i < stable.length && stable[i] === prev + 1) { prev = stable[i]; continue; }
    console.log(`  [${s}:${prev}] len=${prev - s + 1}: ${b1.slice(s, prev + 1).join(',')}`);
    if (i < stable.length) { s = stable[i]; prev = stable[i]; }
  }
  console.log('\n变化段:', JSON.stringify(diff.slice(0, 30)));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
