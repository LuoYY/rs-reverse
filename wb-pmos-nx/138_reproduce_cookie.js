/**
 * 138_reproduce_cookie.js
 *
 * 手动重现 Cookie.run() 加密（用保存的 keys/runTime）→ 对比保存的 cookie
 * 若相同 → 逻辑对（反解失败是别的问题）；若不同 → 定位参数差异
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const parser = require('@src/handler/parser');
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const { xor } = require('@src/handler/parser/common/');

  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_412_')).sort();
  const s = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  console.log('nsd:', s.nsd, 'runTime:', s.runTime, 'random:', s.random);
  const { numToNumarr4, uuid, numarrJoin, numarr2string } = parser;

  const savedCookie = s.cookie.split('=')[1];
  console.log('保存 cookie len:', savedCookie.length);

  // 手动重现
  const keys = s.keys;
  const keys2 = s.keys2, keys16 = s.keys16, keys17 = s.keys17;
  const basearr = s.basearr;
  const runTime = s.runTime;
  const random = s.random; // null → Math.random()

  // Cookie.run() 逻辑
  const basearrEncrypt = encryptMode1(
    xor(numarrEncrypt(basearr), keys2, 16),
    numarrAddTime(keys17, runTime, random)[0],
    0
  );
  const nextarr = numarrJoin(
    numarrJoin(2, numToNumarr4([s.config ? s.config.r2mkaTime : 0, s.config ? s.config.startTime : runTime - 1]), keys2),
    undefined,
    basearrEncrypt,
  );
  // r2mkaTime 从 keys[21]
  let r2mkaTime = 0;
  if (keys[21]) r2mkaTime = parseInt(keys[21].map(c => String.fromCharCode(c)).join(''), 10);
  const startTime = runTime - 1;
  console.log('r2mkaTime:', r2mkaTime, 'startTime:', startTime);
  const nextarr2 = numarrJoin(
    numarrJoin(2, numToNumarr4([r2mkaTime, startTime]), keys2),
    undefined,
    basearrEncrypt,
  );
  const myCookie = '0' + numarr2string(
    encryptMode1(
      [...numToNumarr4(uuid(nextarr2)), ...nextarr2],
      numarrAddTime(keys16, runTime, random)[0],
      1,
      random
    ),
    BASESTR.split('')
  );
  console.log('手动 cookie len:', myCookie.length);
  console.log('与保存 cookie 相同:', myCookie === savedCookie ? '★★★ YES' : 'NO');
  if (myCookie !== savedCookie) {
    // 找不同位置
    let d = -1;
    for (let i = 0; i < Math.min(myCookie.length, savedCookie.length); i++) {
      if (myCookie[i] !== savedCookie[i]) { d = i; break; }
    }
    console.log('首个不同 @', d, 'my:', myCookie[d], 'saved:', savedCookie[d]);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
