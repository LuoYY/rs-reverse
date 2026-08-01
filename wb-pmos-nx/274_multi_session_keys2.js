/**
 * 274_multi_session_keys2.js
 *
 * 多会话对比 browserK2 vs pureK2（XOR 差异是否跨会话固定 = 浏览器指纹因子）
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
      if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) {
        return { off, keys };
      }
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

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  // 多会话：sync + det_cookie
  const sessions = [];
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const sp = sync.cookies.find(c => c.name.endsWith('P'));
  sessions.push({ name: 'sync', nsd: sync.challenge.nsd, cd: sync.challenge.cd, pCookie: sp.value });
  for (const f of fs.readdirSync(OUT).filter(f => f.startsWith('det_cookie_')).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
    sessions.push({ name: f.replace('.json', ''), nsd: d.nsd, cd: d.cd, pCookie: d.pCookie });
  }

  let xorSets = [];
  for (const s of sessions) {
    try {
      const cdArr = decryptCd(s.cd);
      const der = deriveKeys(cdArr);
      if (!der) { console.log(s.name + ': keys 推导失败'); continue; }
      const pureK2 = der.keys[2];
      // 外层解密拿 browserK2
      const C = decodeB86(s.pCookie.slice(1));
      const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
      const dec = encryptMode2([...C], arr, 1);
      const nextarr = dec.slice(4);
      const p8 = pureK2.slice(0, 8);
      let k2pos = -1;
      for (let i = 0; i + 8 <= nextarr.length; i++) {
        if (nextarr.slice(i, i + 8).every((v, j) => v === p8[j])) { k2pos = i; break; }
      }
      if (k2pos < 0) {
        // 尝试纯算法 keys2 前缀不在 → 用第一个 48B 段（位置 11）
        console.log(s.name + ': 纯算法 keys2 不在 nextarr! 检查位置 11');
        const browserK2 = nextarr.slice(11, 59);
        console.log('  browserK2 前 8:', browserK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('  pureK2 前 8:  ', pureK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
        const xor = browserK2.map((v, i) => v ^ pureK2[i]);
        xorSets.push({ name: s.name, nsd: s.nsd, xor: xor.slice(0, 16) });
        console.log('  XOR 前 16:', xor.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
      } else {
        console.log(s.name + ': 纯算法 keys2 在 nextarr @' + k2pos + ' (一致!)');
      }
    } catch (e) { console.log(s.name + ': 错误', e.message.substring(0, 50)); }
  }
  // 对比 xorSets 是否相同
  if (xorSets.length >= 2) {
    const same = xorSets[0].xor.every((v, i) => v === xorSets[1].xor[i]);
    console.log('\n两会话 XOR 差异是否相同:', same ? '★★★ 固定（浏览器指纹常量!）' : 'NO（会话相关）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
