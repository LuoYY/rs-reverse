// 用 Node 管线 tscd.init 提取 gv.keys[2]，看是否含 317
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const getImmucfg = require('@utils/getImmucfg');
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

(async () => {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_nsd_cd.json', 'utf8'));
  const gv = require('@src/handler/globalVarible');
  gv._setAttr('config', { keynameNum: 1151, adapt: { lastWord: 'P' } });
  const immucfg = getImmucfg(fs.readFileSync(OUTER_JS, 'utf8'));
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ nsd: d.nsd, cd: d.cd, keynameNum: 1151, hasCodemap: true, hasDebug: false }, immucfg);
  const ret = coder.run();
  gv.config.codemap = ret.codemap;
  // 设置 dynamicTaskOffset（用 deriveOffset）
  const decrypt = require('@src/handler/parser/common/decrypt');
  const cdArr = decrypt(d.cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  // 手动 deriveOffset（同 Node 版）
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
          if (keys && keys.length > 32 && keys[2] && keys[2].length === 48 &&
              [29, 30, 31, 32].every(k => keys[k] && keys[k].length === 4)) {
            return { offset, keys };
          }
        }
      }
    } catch (e) {}
    return null;
  }
  const dOff = deriveOffset(tail);
  if (!dOff) { console.log('deriveOffset failed'); process.exit(1); }
  console.log('offset:', dOff.offset.join(','));
  console.log('Node genKeysSim keys[2][15]:', dOff.keys[2][15], 'keys[2] @43/44:', dOff.keys[2][43], dOff.keys[2][44]);
  // 设置 dynamicTaskOffset 跑 tscd.init
  gv._setAttr('dynamicTaskOffset', dOff.offset);
  const tscd = require('@src/handler/parser/tscd');
  tscd.init();
  console.log('\ngv.keys[2]:', gv.keys[2].join(','));
  console.log('gv.keys[2][15]:', gv.keys[2][15], '(317? 或 169?)');
  console.log('gv.keys[2][43]:', gv.keys[2][43], 'gv.keys[2][44]:', gv.keys[2][44]);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
