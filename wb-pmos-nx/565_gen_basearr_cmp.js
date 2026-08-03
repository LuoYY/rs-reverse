/**
 * 565_gen_basearr_cmp.js
 * 决定性：用 xb len243.js 相同 numarrJoin 结构 + nx keys/config 生成 basearr
 * 与浏览器 basearr 明文逐段对比 → 判断 nx 是否同结构（若同，绑定字节=execNumberByTime 随机可过）
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src', 'handler', 'parser/constData')).init();
const parser = require(path.join(__dirname, '..', 'src', 'handler', 'parser'));

const {
  numToNumarr2, numToNumarr4, numToNumarr8, uuid, string2ascii,
  execRandomByNumber, execNumberByTime, hexnum, ascii2string,
  numarrAddTime, decrypt, encryptMode1, encryptMode2, numarrJoin,
} = parser;

// nx S1 数据
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'))[0];
const browserBasearr = d.basearr;
const keys = d.keys;
console.log('浏览器 basearr len:', browserBasearr.length);
console.log('keys 数量:', keys.length);

// 模拟 config（xb makecookieRuntimeConfig 风格）
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
  r2mkaTime: 0,
  startTime: 0,
  currentTime: Date.now(),
  runTime: Math.floor(Date.now() / 1000),
};

// 用 xb len243.js 结构生成（[1] 段环境指纹 + [10] 段 + [7] 段 + [6] 段 + [2] 段 + [9] 段 + [13] 段）
// 注意：nx 有 keys[22] 段，xb len243.js [6] 段用 encryptMode2(decrypt(keys22), keys16)
const gv = { keys, config: { url: { pathname: '/' } } };
try {
  const flag = +ascii2string(keys[24]);
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
    ...numToNumarr4(+ascii2string(keys[19])),
    ...numToNumarr8(Math.floor((config.random || Math.random()) * 1048575) * 4294967296 + (((config.currentTime + 0) & 4294967295) >>> 0)),
    flag,
  ];
  const seg7 = [
    ...numToNumarr4(16777216),
    ...numToNumarr4(0),
    ...numToNumarr2(1801),
    ...numToNumarr2(config.codeUid),
  ];
  // [6] 段（keys22 加密，xb 结构）
  let seg6 = [1, 0, 0, 1];
  try {
    const k22s = ascii2string(keys[22]);
    const decK22 = decrypt(k22s);
    seg6 = [
      1,
      ...numToNumarr2(2), ...numToNumarr2(2),
      1,
      ...encryptMode2(decK22, numarrAddTime(keys[16])[0]),
      ...numToNumarr2(+decrypt(decK22)),
    ];
  } catch (e) { console.log('[6]段失败:', e.message.substring(0, 60)); }

  const gen = numarrJoin(
    3, seg1,
    10, seg10,
    7, seg7,
    0, [], // seg0Override（xb 硬编码指纹块，nx 未知）
    6, seg6,
    2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    9, [8, 0],
    13, [0],
  );
  console.log('\n生成 basearr len:', gen.length);
  console.log('生成:', gen.map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('\n浏览器:', browserBasearr.map(x => x.toString(16).padStart(2, '0')).join(' '));

  // 对比：前缀匹配长度 + 动态段位置
  let matchLen = 0;
  const minLen = Math.min(gen.length, browserBasearr.length);
  for (let i = 0; i < minLen; i++) {
    if (gen[i] === browserBasearr[i]) matchLen = i + 1;
    else break;
  }
  console.log('\n前缀匹配长度:', matchLen);
  console.log('生成[0-8]:', gen.slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('浏览[0-8]:', browserBasearr.slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(' '));
} catch (e) {
  console.error('生成失败:', e.message, e.stack.split('\n').slice(0, 3).join(' | '));
}
process.exit(0);
