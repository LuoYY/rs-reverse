/**
 * 263_check_cdarr.js
 *
 * 检查 cdArr 是否含 >255 值，tail 的结构
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
  const decrypt = require('@src/handler/parser/common/decrypt');
  const decode = require('@src/handler/parser/common/decode');

  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const cd = sync.challenge.cd;

  // decrypt 是什么？
  console.log('decrypt source:');
  const src = fs.readFileSync(path.join(ROOT, 'src/handler/parser/common/decrypt.js'), 'utf8');
  console.log(src.substring(0, 800));

  const cdArr = decrypt(cd);
  console.log('\ncdArr len:', cdArr.length, 'max:', Math.max(...cdArr), 'min:', Math.min(...cdArr));
  const bigs = [];
  for (let i = 0; i < cdArr.length; i++) if (cdArr[i] > 255) bigs.push(i + ':' + cdArr[i]);
  console.log('>255 位置:', bigs.slice(0, 10).join(', '));
  console.log('>255 数量:', bigs.length);
  console.log('cdArr 前 30:', cdArr.slice(0, 30).join(','));

  // decode 测试
  try {
    const d = decode(cd);
    console.log('\ndecode len:', d.length, 'max:', Math.max(...d));
  } catch (e) { console.log('decode err:', e.message.substring(0, 50)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
