/**
 * 127_verify_keys_consistency.js
 *
 * 用保存的 offset 重新跑 genKeys（step2/step1），对比 tscd 生成的 keys（保存的）
 * 确认 deriveOffset 与 tscd 的 keys 一致性 + keys16==K16 验证
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const decrypt = require('@src/handler/parser/common/decrypt');

  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_412_')).sort();
  for (const f of files) {
    const s = JSON.parse(fs.readFileSync(path.join(OUT, f)));
    console.log('\n=== nsd:', s.nsd, 'offset:', s.offset.map(b => b.toString(16).padStart(2, '0')).join(' '), '===');
    console.log('保存 keys2:', s.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const cdArr = decrypt(s.cd);
    const end = (cdArr[0] << 8 | cdArr[1]) + 2;
    const tail = cdArr.slice(end);
    const ans = tail.map((b, i) => b ^ s.offset[i % 8]);
    console.log('numKeys:', ans[0]);
    // tscd 的 genKeys（step2 → step1）
    const genKeysTscd = (() => {
      function getLens(numarr, idx) {
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
      function genKeys(step) {
        const keys = [];
        let op = 1, gap;
        for (let i = 0; i < ans[0]; i++) {
          if (step === 2) { gap = (ans[op] << 8) | ans[op + 1]; op += 2; }
          else if (step === 1) { [gap, op] = getLens(ans, op); }
          keys.push(ans.slice(op, op + gap));
          op += gap;
        }
        return keys;
      }
      const k2 = genKeys(2);
      if ([29, 30, 31, 32].every(k => k2[k] && k2[k].length === 4)) return { step: 2, keys: k2 };
      const k1 = genKeys(1);
      return { step: 1, keys: k1 };
    })();
    console.log('tscd genKeys step:', genKeysTscd.step, 'keys 数:', genKeysTscd.keys.length);
    const tks = genKeysTscd.keys;
    const same2 = tks[2] && tks[2].every((v, i) => v === s.keys2[i]);
    console.log('与保存 keys2 一致:', same2 ? 'YES' : 'NO');
    console.log('keys16 == K16:', tks[16] && tks[16].every((v, i) => v === K16[i]) ? 'YES' : 'NO');
    console.log('keys17:', tks[17] ? tks[17].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
    console.log('keys[29..32] len:', [29, 30, 31, 32].map(k => tks[k] ? tks[k].length : '无').join(','));
    // 保存的 keys 数
    console.log('保存 keys 数:', s.keys ? s.keys.length : '无');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
