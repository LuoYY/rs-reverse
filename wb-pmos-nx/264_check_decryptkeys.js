/**
 * 264_check_decryptkeys.js
 *
 * 检查 decryptKeys 表 + 复现 decrypt 的 >255 值
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
  const decrypt = require('@src/handler/parser/common/decrypt');

  const dk = gv.decryptKeys;
  console.log('decryptKeys:', Array.isArray(dk) ? '数组 len=' + dk.length : typeof dk);
  if (Array.isArray(dk)) {
    dk.forEach((t, i) => {
      if (Array.isArray(t)) {
        const max = Math.max(...t);
        if (max > 255) console.log('  表' + i + ' len=' + t.length + ' max=' + max + ' >255');
      }
    });
  }

  // 复现 decrypt 的 >255
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const cd = sync.challenge.cd;
  const cdArr = decrypt(cd);
  const bigIdx = [];
  for (let i = 0; i < cdArr.length; i++) if (cdArr[i] > 255) bigIdx.push(i);
  console.log('\n>255 索引:', bigIdx.join(','));
  const [data1, data2, data3, data4, data5, data6] = dk;
  for (const bi of bigIdx.slice(0, 5)) {
    // 复现：bi 对应的字符
    const i = bi;
    // 每 4 字符 3 字节。bi 是字节索引。找到字符位置
    // 字节 bi 来自 4 字符组
    // ans.push(data1[one] | data2[two]) → 字节 0,3,6...
    // ans.push(data3[two] | data4[three]) → 字节 1,4,7...
    // ans.push(data5[three] | data6[four]) → 字节 2,5,8...
    const group = Math.floor(bi / 3) * 4; // 字符组起点
    const sub = bi % 3;
    const str = cd;
    const c0 = str[group].charCodeAt();
    const c1 = str[group + 1] ? str[group + 1].charCodeAt() : undefined;
    const c2 = str[group + 2] ? str[group + 2].charCodeAt() : undefined;
    const c3 = str[group + 3] ? str[group + 3].charCodeAt() : undefined;
    if (sub === 0) console.log('字节' + bi + ': data1[' + c0 + ']=' + data1[c0] + ' | data2[' + c1 + ']=' + data2[c1] + ' = ' + (data1[c0] | data2[c1]) + ' (cd=' + c0 + ',' + c1 + ')');
    else if (sub === 1) console.log('字节' + bi + ': data3[' + c1 + ']=' + data3[c1] + ' | data4[' + c2 + ']=' + data4[c2] + ' = ' + (data3[c1] | data4[c2]));
    else console.log('字节' + bi + ': data5[' + c2 + ']=' + data5[c2] + ' | data6[' + c3 + ']=' + data6[c3] + ' = ' + (data5[c2] | data6[c3]));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
