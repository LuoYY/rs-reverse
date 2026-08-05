// 从 sdenv 生成的 cookie nextarr 提取 keys2，与 cd 解析的 keys[2]（317 版）对比
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

(async () => {
  // 用 sdenv 生成 cookie + 提取 keys
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const w = dom.window;
  const nsd = w.$_ts.nsd;
  const cd = String(w.$_ts.cd);
  // 等 cookie
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
  const P = cookies.split(';')[1].split('=')[1].trim();
  const payload = P.startsWith('a') ? P.slice(1) : P;
  const bytes = numarr2stringDecode(payload);
  // 外层解密需要 keys16——用 sdenv 提取的
  // 简化：直接从 bytes 反推（外层 IV 前置，keys16 未知）
  // 用 cd 解析的 keys16（=sdenv k16 已验证一致）
  console.log('cd len:', cd.length, 'nsd:', nsd);

  // 用已知 keys16 解密外层
  // 需要 sdenv 的 keys16——从之前会话（k16 固定）
  const k16 = [215,90,92,114,190,161,210,59,55,192,204,2,209,95,17,173]; // sdenv 提取
  const iv = bytes.slice(0, 16);
  const enc = bytes.slice(16);
  const outerDec = aesDecrypt(enc, k16, iv);
  const pad = outerDec[outerDec.length - 1];
  const stripped = outerDec.slice(0, outerDec.length - pad);
  const nextarr = stripped.slice(4);
  let idx = 0;
  const tag = nextarr[0], len8 = nextarr[1]; idx += 2 + 8;
  const keys2len = nextarr[idx]; idx++;
  const cookieKeys2 = nextarr.slice(idx, idx + keys2len);
  console.log('cookie nextarr keys2:', cookieKeys2.join(','));
  console.log('cookie keys2[15]:', cookieKeys2[15], '(Go cd=317, sdenv提取=169)');
  console.log('cookie keys2 == sdenv keys2(169版)?', cookieKeys2.join(',') === [14,194,25,253,169,94,239,226,212,151,80,3,7,166,24,169,180,159,236,223,69,18,37,153,169,77,248,255,145,72,44,3,194,173,106,203,53,59,48,249,47,91,184,186,233,178,65,162].join(','));
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
