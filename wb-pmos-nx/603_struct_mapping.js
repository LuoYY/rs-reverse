/**
 * 603_struct_mapping.js
 * 用 xb len243.js numarrJoin 结构为 nx 生成 basearr（nx keys + config）
 * 与浏览器 basearr 对齐，找结构映射（nx 是否也是 numarrJoin 但标记不同/偏移不同）
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const gv = require(path.join(__dirname, '..', 'src/handler/globalVarible'));
const NX_CD = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
gv.cache = gv.cache || {};
gv.cache.config = { adapt: { cdBasestr: NX_CD, getKey: 0x68 } };
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();

const parser = require(path.join(__dirname, '..', 'src/handler/parser'));
const { numarrJoin, numToNumarr2, numToNumarr4, numToNumarr8, uuid, string2ascii, execRandomByNumber, hexnum, ascii2string, numarrAddTime, decrypt, encryptMode2, numarrEncrypt } = parser;

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 2; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  console.log(`\n=== S${i + 1} 浏览器 basearr (len=${b.length}) ===`);
  console.log(b.map(x => x.toString(16).padStart(2, '0')).join(' '));

  const config = {
    'window.navigator.maxTouchPoints': 0,
    'window.eval.toString().length': 33,
    'window.navigator.userAgent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'window.navigator.platform': 'MacIntel',
    'window.innerHeight': 938,
    'window.innerWidth': 1680,
    'window.outerHeight': 1025,
    'window.outerWidth': 1680,
    'window.document.hidden': false,
    execNumberByTime: 1500 + Math.floor(Math.random() * 500),
    random: null,
    codeUid: 0,
  };
  const flag = +ascii2string(k[24]);

  // xb len243.js 完整结构
  try {
    const seg1 = numarrJoin(
      1,
      config['window.navigator.maxTouchPoints'],
      config['window.eval.toString().length'],
      128,
      ...numToNumarr4(uuid(config['window.navigator.userAgent'])),
      string2ascii(config['window.navigator.platform']),
      ...numToNumarr4(config.execNumberByTime),
      ...execRandomByNumber(98, config.random),
      0, 0,
      ...numToNumarr4(Number(hexnum('3136373737323136'))),
      ...numToNumarr4(0),
      ...numToNumarr2(config['window.innerHeight']),
      ...numToNumarr2(config['window.innerWidth']),
      ...numToNumarr2(config['window.outerHeight']),
      ...numToNumarr2(config['window.outerWidth']),
      ...numToNumarr8(0),
      ...numToNumarr4(0),
      ...numToNumarr4(0),
      ...numToNumarr4(uuid('/px-common-authcenter/auth/v2/captcha/get'.toUpperCase())),
      ...numToNumarr4(0),
      ...numToNumarr8(0),
    );
    const seg10 = [
      flag > 0 && flag < 8 ? 1 : 0, 13,
      ...numToNumarr4(k[21] ? +ascii2string(k[21]) + 60 : 0),
      ...numToNumarr4(+ascii2string(k[19])),
      ...numToNumarr8(Math.floor(Math.random() * 1048575) * 4294967296 + ((Date.now()) & 4294967295) >>> 0),
      flag,
    ];
    const seg7 = [...numToNumarr4(16777216), ...numToNumarr4(0), ...numToNumarr2(1801), ...numToNumarr2(0)];
    let seg6 = [1, 0, 0, 0];
    try {
      const dec22 = decrypt(ascii2string(k[22]));
      const [k16t] = numarrAddTime([...k[16]]);
      seg6 = [1, ...numToNumarr2(2), ...numToNumarr2(2), 1, ...encryptMode2([...dec22], k16t, 0), ...numToNumarr2(0)];
    } catch (e) {}
    const seg2 = Array(20).fill(0);
    const gen = numarrJoin(3, seg1, 10, seg10, 7, seg7, 0, [], 6, seg6, 2, seg2, 9, [8, 0], 13, [0]);
    console.log(`xb 结构生成 (len=${gen.length}):`);
    console.log(gen.map(x => x.toString(16).padStart(2, '0')).join(' '));

    // 对齐找共同前缀
    let mlen = 0;
    for (let j = 0; j < Math.min(gen.length, b.length); j++) {
      if (gen[j] === b[j]) mlen = j + 1; else break;
    }
    console.log('共同前缀:', mlen);
    // 搜索 gen 的任何连续段在 b 中的位置
    for (let gs = 0; gs < gen.length; gs += 4) {
      for (let bs = 0; bs < b.length; bs++) {
        let l = 0;
        while (gs + l < gen.length && bs + l < b.length && gen[gs + l] === b[bs + l]) l++;
        if (l >= 6) console.log(`gen[${gs}+${l}] == b[${bs}+${l}]`);
      }
    }
  } catch (e) {
    console.log('生成失败:', e.message.substring(0, 80));
  }
}
process.exit(0);
