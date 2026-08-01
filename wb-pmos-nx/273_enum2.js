/**
 * 273_enum2.js
 *
 * 完整流程：NX_BS decrypt → 枚举 offset → 找 keys2 = 真实浏览器 keys2
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();

  const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
  function makeDecryptKeys(bs) {
    return bs.split('').reduce((ans, key, idx) => {
      const code = key.charCodeAt();
      ans[0][code] = idx << 2;
      ans[1][code] = idx >> 4;
      ans[2][code] = (idx & 15) << 4;
      ans[3][code] = idx >> 2;
      ans[4][code] = (idx & 3) << 6;
      ans[5][code] = idx;
      return ans;
    }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
  }
  const dk = makeDecryptKeys(NX_BS);
  const [d1, d2, d3, d4, d5, d6] = dk;

  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const cd = sync.challenge.cd;
  const cdArr = [];
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && cdArr.push(d1[one] | d2[two]);
    three !== undefined && cdArr.push(d3[two] | d4[three]);
    four !== undefined && cdArr.push(d5[three] | d6[four]);
  }
  console.log('cdArr len:', cdArr.length, 'max:', Math.max(...cdArr));
  fs.writeFileSync(path.join(OUT, 'cdArr_fixed2_' + sync.challenge.nsd + '.json'), JSON.stringify({ cdArr }));

  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  console.log('tail len:', tail.length, 'tail 前 8:', tail.slice(0, 8).join(','));

  const nf = fs.readdirSync(OUT).filter(x => x.startsWith('browser_nextarr_')).sort().pop();
  const nd = JSON.parse(fs.readFileSync(path.join(OUT, nf)));
  const realK2 = nd.nextarr.slice(11, 59);
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

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

  let count = 0;
  let full = null, prefix = null;
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
        count++;
        const k2 = keys[2];
        if (k2 && k2.length === 48 && k2.every((v, i) => v === realK2[i])) full = { off, keys, k0, k1 };
        else if (k2 && k2.slice(0, 8).every((v, i) => v === realK2[i])) prefix = { off, keys, k0, k1 };
      }
    }
  }
  console.log('keys16==K16 解:', count);
  if (full) {
    console.log('★★★ keys2 完全匹配! offset:', JSON.stringify(full.off));
    console.log('keys17:', JSON.stringify(full.keys[17]));
    console.log('keys15:', JSON.stringify(full.keys[15]));
    console.log('keys18 前 8:', JSON.stringify(full.keys[18].slice(0, 8)));
    fs.writeFileSync(path.join(OUT, 'keys_browser.json'), JSON.stringify({ offset: full.off, keys: full.keys }));
  } else if (prefix) {
    console.log('★★ keys2 前缀匹配! offset:', JSON.stringify(prefix.off));
    console.log('pure keys2:', JSON.stringify(prefix.keys[2]).substring(0, 100));
  } else {
    console.log('无 keys2 匹配');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
