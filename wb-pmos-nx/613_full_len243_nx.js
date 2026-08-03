/**
 * 613_full_len243_nx.js
 * 完整复现 xb len243.js numarrJoin 结构 + nx keys/config 生成 basearr
 * 对比浏览器 basearr 找每段匹配，判断 nx 是否复用 xb 结构（部分适用）
 * 关键：xb seg10 time4 = r2mkaTime + runTime - startTime（纯算法）
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const gv = require(path.join(__dirname, '..', 'src/handler/globalVarible'));
const NX_CD = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
gv.cache = gv.cache || {};
gv.cache.config = { adapt: { cdBasestr: NX_CD, getKey: 0x68, flag: 1801 } };
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();

const parser = require(path.join(__dirname, '..', 'src/handler/parser'));
const {
  numarrJoin, numToNumarr2, numToNumarr4, numToNumarr8, uuid, string2ascii,
  execRandomByNumber, hexnum, ascii2string, numarrAddTime, decrypt, encryptMode2, decode,
} = parser;

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 2; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  console.log(`\n=== S${i + 1} 浏览器 basearr len=${b.length} ===`);
  console.log('浏览器:', b.map(x => x.toString(16).padStart(2, '0')).join(' '));

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
    execNumberByTime: 1500,
    random: null,
    codeUid: 0,
    r2mkaTime: +ascii2string(k[21]),
    runTime: Math.floor(Date.now() / 1000),
    startTime: Math.floor(Date.now() / 1000) - 30,
    currentTime: Date.now(),
  };
  const flag = +ascii2string(k[24]);
  const k19n = +ascii2string(k[19]);

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
    );
    const seg10 = [
      flag > 0 && flag < 8 ? 1 : 0, 13,
      ...numToNumarr4(config.r2mkaTime + config.runTime - config.startTime),
      ...numToNumarr4(k19n),
      ...numToNumarr8(Math.floor(Math.random() * 1048575) * 4294967296 + ((config.currentTime & 4294967295) >>> 0)),
      flag,
    ];
    const seg7 = [...numToNumarr4(16777216), ...numToNumarr4(0), ...numToNumarr2(1801), ...numToNumarr2(0)];
    let seg6 = [1, 0, 0, 0];
    try {
      const dec22 = decrypt(ascii2string(k[22]));
      const [k16t] = numarrAddTime([...k[16]]);
      seg6 = [1, ...numToNumarr2(2), ...numToNumarr2(2), 1, ...encryptMode2([...dec22], k16t, 0), ...numToNumarr2(+decode(dec22))];
    } catch (e) { console.log('seg6 失败:', e.message.substring(0, 50)); }
    const gen = numarrJoin(3, seg1, 10, seg10, 7, seg7, 0, [], 6, seg6, 2, Array(20).fill(0), 9, [8, 0], 13, [0]);

    console.log('xb 结构生成 len=' + gen.length + ':');
    console.log('生成:', gen.map(x => x.toString(16).padStart(2, '0')).join(' '));
    // 找匹配
    for (let gs = 0; gs < gen.length; gs++) {
      for (let bs = 0; bs < b.length; bs++) {
        let l = 0;
        while (gs + l < gen.length && bs + l < b.length && gen[gs + l] === b[bs + l]) l++;
        if (l >= 5) console.log(`★★ gen[${gs}+${l}] == b[${bs}+${l}]`);
      }
    }
  } catch (e) {
    console.log('生成失败:', e.message.substring(0, 100));
  }
}
process.exit(0);
