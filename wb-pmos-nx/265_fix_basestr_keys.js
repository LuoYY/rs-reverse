/**
 * 265_fix_basestr_keys.js
 *
 * 用 nx 86 basestr（含 -）重新生成 decryptKeys → decrypt(cd) → 验证 >255 消失
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

  const NX_BASESTR = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
  console.log('nx basestr len:', NX_BASESTR.length);
  console.log('当前 gv.basestr:', (gv.basestr || '').substring(0, 40), 'len:', (gv.basestr || '').length);
  console.log('nx basestr 前 40:', NX_BASESTR.substring(0, 40));
  console.log('含-:', NX_BASESTR.includes('-'), '含.:', NX_BASESTR.includes('.'));

  // 用 nx basestr 重新生成 decryptKeys
  function makeDecryptKeys(basestr) {
    const ans = Array.from({ length: 6 }, () => new Array(256).fill(0));
    basestr.split('').reduce((acc, key, idx) => {
      const code = key.charCodeAt();
      ans[0][code] = idx << 2;
      ans[1][code] = idx & 3;
      ans[2][code] = idx >> 2;
      ans[3][code] = idx & 15;
      ans[4][code] = idx >> 4;
      ans[5][code] = idx & 63;
      return acc;
    }, null);
    return ans;
  }
  // 先看 constData 的完整 makeDecryptKeys
  const src = fs.readFileSync(path.join(ROOT, 'src/handler/parser/constData.js'), 'utf8');
  console.log('\nmakeDecryptKeys 源码:');
  const m = src.match(/function makeDecryptKeys\(\) \{[\s\S]*?\n\}/);
  console.log(m ? m[0] : '未找到');

  const dkNew = makeDecryptKeys(NX_BASESTR);
  // 检查 data1 的 >255
  const max1 = Math.max(...dkNew[0]);
  console.log('\n新 data1 max:', max1);

  // 用新表 decrypt
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const cd = sync.challenge.cd;
  const cdArr = [];
  const [data1, data2, data3, data4, data5, data6] = dkNew;
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && cdArr.push(data1[one] | data2[two]);
    three !== undefined && cdArr.push(data3[two] | data4[three]);
    four !== undefined && cdArr.push(data5[three] | data6[four]);
  }
  const bigs = cdArr.filter(v => v > 255);
  console.log('新 decrypt >255 数量:', bigs.length, bigs.slice(0, 5).join(','));
  console.log('新 cdArr len:', cdArr.length, 'max:', Math.max(...cdArr));
  fs.writeFileSync(path.join(OUT, 'cdArr_fixed_' + sync.challenge.nsd + '.json'), JSON.stringify({ cdArr }));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
