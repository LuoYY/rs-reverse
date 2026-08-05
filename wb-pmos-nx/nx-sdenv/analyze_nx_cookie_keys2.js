// 用 95 脚本的同进程反解方法正确提取 cookie 的 keys2 + basearr（Node 管线）
// 核心：用 gv.keys16 + runTime 遍历 ele 反解外层，uuid 验证自洽
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const getImmucfg = require('@utils/getImmucfg');
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
  return numarr;
}

(async () => {
  // 生成 sdenv cookie
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

  // 用 Node 管线生成 keys
  const gv = require('@src/handler/globalVarible');
  gv._setAttr('config', { keynameNum: 1151, adapt: { lastWord: 'P' } });
  const immucfg = getImmucfg(fs.readFileSync(OUTER_JS, 'utf8'));
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ nsd, cd, keynameNum: 1151, hasCodemap: true, hasDebug: false }, immucfg);
  const ret = coder.run();
  gv.config.codemap = ret.codemap;
  // deriveOffset
  const decrypt = require('@src/handler/parser/common/decrypt');
  const cdArr = decrypt(cd);
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
  function genKeysSim(ans, step) {
    const keys = [];
    let op = 1, gap;
    try {
      for (let i = 0; i < ans[0]; i++) {
        if (step === 2) { if (op + 1 >= ans.length) return null; gap = (ans[op] << 8) | ans[op + 1]; op += 2; }
        else { [gap, op] = getLensGo(ans, op); }
        if (gap < 0 || op + gap > ans.length) return null;
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
    } catch (e) { return null; }
    return keys;
  }
  function deriveOffset(tail) {
    try {
      const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
      for (let k0 = 0; k0 <= 127; k0++) {
        const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
        for (let k1 = 0; k1 <= 127; k1++) {
          const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
          const offset = [off0, off1, off2, off3, off4, off5, off6, off7];
          const ans = tail.map((b, i) => b ^ offset[i % 8]);
          if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
          const keys = genKeysSim(ans, 1);
          if (keys && keys.length > 32 && keys[2] && keys[2].length === 48 && [29, 30, 31, 32].every(k => keys[k] && keys[k].length === 4)) {
            return { offset, keys };
          }
        }
      }
    } catch (e) {}
    return null;
  }
  console.log('tail 前14:', tail.slice(0, 14).join(','));
  // 直接尝试 genKeys（不验证 keys[29..32]）
  for (let k0 = 0; k0 <= 2; k0++) {
    for (let k1 = 0; k1 <= 2; k1++) {
      const offset = [tail[0]^51, tail[1]^2, tail[2]^k0, tail[3]^k1, tail[4]^2, tail[5]^k0, tail[6]^k1, tail[7]^48];
      const ans = tail.map((b, i) => b ^ offset[i % 8]);
      if (ans[0] === 51 && ans[1] === 2 && ans[4] === 2 && ans[7] === 48) {
        const keys = genKeysSim(ans, 1);
        console.log(`  k0=${k0} k1=${k1}: keys len=${keys ? keys.length : 'null'} keys[2] len=${keys && keys[2] ? keys[2].length : 'x'}`);
      }
    }
  }
  const dOff = deriveOffset(tail);
  if (!dOff) { console.log('deriveOffset failed'); process.exit(1); }
  gv._setAttr('dynamicTaskOffset', dOff.offset);
  const tscd = require('@src/handler/parser/tscd');
  tscd.init();
  console.log('cd keys[2]:', gv.keys[2].join(','));
  console.log('cd keys[2] 含 >255:', gv.keys[2].filter(v => v > 255));

  // 用 Node 管线反解 sdenv cookie（同进程反解：遍历 ele 找 uuid 自洽）
  const parser2 = require('@src/handler/parser');
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime2 = require('@src/handler/parser/common/numarrAddTime');
  const payload = P.startsWith('0') ? P.slice(1) : P;
  const bytes = numarr2stringDecode(payload);
  console.log('bytes len:', bytes.length);
  const rt2 = 1800000000; // 尝试
  // 需要 gv.makecookieRuntimeConfig 的 runTime——用 Cookie 生成
  const Cookie = require('@src/handler/Cookie');
  const cookieMaker = new Cookie(coder);
  const cookie = cookieMaker.run();
  const runTime = cookieMaker.config.runTime;
  const random = cookieMaker.config.random;
  console.log('runTime:', runTime, 'random:', random, 'cookie len:', cookie.length);

  // 反解 sdenv cookie
  let selfFound = null;
  for (let ele = 1; ele <= 256 && !selfFound; ele++) {
    const arr2 = numarrAddTime2([...gv.keys[16]], runTime, ele / 256)[0];
    const dec2 = encryptMode2([...bytes], arr2, 1);
    if (dec2.length > 20) {
      const calc2 = parser2.numToNumarr4(parser2.uuid(dec2.slice(4)));
      if (calc2.every((b, i) => b === dec2[i])) { selfFound = { ele, dec: dec2 }; break; }
    }
  }
  if (selfFound) {
    console.log('\n★★★ sdenv cookie 反解成功! ele=' + selfFound.ele);
    const dec = selfFound.dec;
    const nextarr = dec.slice(4);
    console.log('nextarr 前24:', nextarr.slice(0, 24).join(','));
    let idx = 2 + 8;
    const keys2len = nextarr[idx]; idx++;
    const cookieK2 = nextarr.slice(idx, idx + keys2len);
    console.log('cookie keys2:', cookieK2.join(','));
    console.log('cookie keys2 == cd keys[2]?', cookieK2.join(',') === gv.keys[2].join(','));
    console.log('cookie keys2 含 >255:', cookieK2.filter(v => v > 255));
  } else {
    console.log('\n✗ 反解失败（runTime=' + runTime + '）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
