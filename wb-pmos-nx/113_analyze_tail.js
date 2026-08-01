process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const decrypt = require('@src/handler/parser/common/decrypt');
  const sync = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/sync_1785512612887.json')));
  const cd = sync.challenge.cd;
  const cdArr = decrypt(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  console.log('end:', end, 'tail:', tail.length);
  console.log('tail 前 60:', tail.slice(0, 60).join(','));
  // 尝试 step2 解析（offset=0）
  let op = 1, out = [];
  try {
    const numKeys = tail[0];
    console.log('numKeys(tail[0]):', numKeys);
    for (let i = 0; i < numKeys && op + 1 < tail.length; i++) {
      const gap = (tail[op] << 8) | tail[op + 1];
      op += 2;
      out.push({ i, gap, op });
      op += gap;
      if (op > tail.length) break;
    }
    console.log('step2 解析:', out.slice(0, 8).map(o => `k${o.i}=gap${o.gap}@${o.op}`).join(' '));
  } catch (e) { console.log('step2 err:', e.message); }
  // 尝试 step1 解析（getLensGo）
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
  op = 1;
  out = [];
  try {
    const numKeys = tail[0];
    for (let i = 0; i < numKeys && op < tail.length; i++) {
      const [gap, nop] = getLensGo(tail, op);
      out.push({ i, gap, op: nop });
      op = nop + gap;
      if (op > tail.length) break;
    }
    console.log('step1 解析:', out.slice(0, 8).map(o => `k${o.i}=gap${o.gap}@${o.op}`).join(' '));
  } catch (e) { console.log('step1 err:', e.message); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
