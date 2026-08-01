/**
 * 266_fix_basestr_full.js
 *
 * 确认 gv.basestr 的 -/. 位置，用 nx basestr 重新生成 decryptKeys
 * 重新推导 keys 验证 keys17 无 316
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
  const gv = require('@src/handler/globalVarible');

  const gvbs = gv.basestr;
  console.log('gv.basestr 完整:', JSON.stringify(gvbs));
  console.log('gv.basestr len:', gvbs.length);
  console.log('- 位置:', gvbs.indexOf('-'), '. 位置:', gvbs.indexOf('.'));

  const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
  console.log('nx basestr - 位置:', NX_BS.indexOf('-'), '. 位置:', NX_BS.indexOf('.'));

  // 用真实 makeDecryptKeys 逻辑 + nx basestr
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

  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const cd = sync.challenge.cd;

  for (const [name, bs] of Object.entries({ gvbs, NX_BS })) {
    const dk = makeDecryptKeys(bs);
    const [d1, d2, d3, d4, d5, d6] = dk;
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
    const bigs = cdArr.filter(v => v > 255).length;
    console.log('\n[' + name + '] cdArr len=' + cdArr.length + ' >255=' + bigs + ' max=' + Math.max(...cdArr));

    // 推导 keys
    const end = (cdArr[0] << 8 | cdArr[1]) + 2;
    const tail = cdArr.slice(end);
    const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
    let found = null;
    for (let k0 = 0; k0 <= 127 && !found; k0++) {
      const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
      for (let k1 = 0; k1 <= 127 && !found; k1++) {
        const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
        const off = [off0, off1, off2, off3, off4, off5, off6, off7];
        const ans = tail.map((b, i) => b ^ off[i % 8]);
        if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
        // 检查 ans 全 0-255
        if (ans.some(v => v > 255)) continue;
        // genKeys
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
        const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
        if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) {
          found = { off, keys };
        }
      }
    }
    if (found) {
      console.log('  ★ 找到 keys! offset:', found.off.join(','));
      console.log('  keys[15]:', JSON.stringify(found.keys[15]));
      console.log('  keys[16]:', JSON.stringify(found.keys[16]));
      console.log('  keys[17]:', JSON.stringify(found.keys[17]));
      console.log('  keys[18]:', JSON.stringify(found.keys[18]));
      fs.writeFileSync(path.join(OUT, 'keys_fixed_' + sync.challenge.nsd + '.json'), JSON.stringify({ basestr: name, offset: found.off, keys: found.keys }));
    } else {
      console.log('  keys 推导失败');
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
