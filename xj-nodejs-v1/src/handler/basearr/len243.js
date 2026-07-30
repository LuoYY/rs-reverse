const parser = require('../parser/');
const gv = require('../globalVarible');

const {
  fixedValue20,
  numToNumarr2,
  numToNumarr4,
  numToNumarr8,
  uuid,
  string2ascii,
  execRandomByNumber,
  execNumberByTime,
  hexnum,
  ascii2string,
  numarrAddTime,
  decode,
  decrypt,
  encryptMode1,
  encryptMode2,
  numarrJoin,
  numarr2string,
  numarrEncrypt,
  xor,
} = parser;

// pmos.xj.sgcc.com.cn (v2 格式, index-v2.html)
// 与 len163/166 结构类似，但 [0] 段为 101 字节加密数据(v2新增)，[10] 段无末尾 flag，[9] 段为 2 字节
function getBasearr(hostname, config) {
  if (!gv.config.adapt?.flag) throw new Error('适配器配置项flag值未定义');
  return numarrJoin(
    3,
    numarrJoin(
      1,
      config['window.navigator.maxTouchPoints'],
      config['window.eval.toString().length'],
      128,
      ...numToNumarr4(uuid(config['window.navigator.userAgent'])),
      string2ascii(config['window.navigator.platform']),
      ...numToNumarr4(config.execNumberByTime),
      ...execRandomByNumber(98, config.random),
      0,
      0,
      ...numToNumarr4(Number(hexnum('3136373737323136'))),
      ...numToNumarr4(0),
      ...numToNumarr2(config['window.innerHeight']),
      ...numToNumarr2(config['window.innerWidth']),
      ...numToNumarr2(config['window.outerHeight']),
      ...numToNumarr2(config['window.outerWidth']),
      ...numToNumarr8(0),
      ...numToNumarr4(0),// 检测链接字符(:20080 真实 basearr 实测为 0)
      ...numToNumarr4(0),
      ...numToNumarr4(uuid(gv.config.url.pathname.toUpperCase())),
      ...numToNumarr4(0),
      ...numToNumarr8(0),
    ),
    10,
    (() => {
      // sdenv ground truth: [flagcheck, 13, time4, keys19_4, random8, flag] = 19 bytes (len123-style)
      const flag = +ascii2string(gv.keys[24]);
      return [
        flag > 0 && flag < 8 ? 1 : 0,
        13,
        ...numToNumarr4(config.r2mkaTime + config.runTime - config.startTime),
        ...numToNumarr4(+ascii2string(gv.keys[19])),
        ...numToNumarr8(Math.floor((config.random || Math.random()) * 1048575) * 4294967296 + (((config.currentTime + 0) & 4294967295) >>> 0)),
        flag,
      ];
    })(),
    7,
    [
      ...numToNumarr4(16777216),
      ...numToNumarr4(0),
      ...numToNumarr2(gv.config.adapt.flag),
      ...numToNumarr2(config.codeUid),
    ],
    0,
    // [0] 段: v2 新增的"浏览器指纹加密块"。
    // 性质: 同一浏览器(指纹)下跨会话固定(站点常量密钥加密), 大小随指纹变化(jsdom=61,真实浏览器=101)。
    // 默认值为 :20080 真实浏览器 247 字节 basearr 的 [0] 段逐字节提取(见 other_base_arr), 覆盖该站全部尝试。
    // 仍可通过 config.seg0Override 注入其他浏览器指纹的 [0] 块。
    (gv.makecookieRuntimeConfig?.seg0Override || [
      47, 119, 54, 154, 195, 77, 48, 41, 123, 55, 111, 49, 253, 235, 248, 167,
      151, 183, 140, 71, 11, 230, 161, 113, 127, 26, 145, 122, 108, 163, 109, 13,
      107, 166, 163, 152, 211, 15, 217, 5, 133, 85, 184, 207, 114, 162, 21, 75,
      16, 65, 58, 91, 178, 2, 173, 195, 245, 45, 25, 149, 136, 73, 25, 83,
      50, 107, 38, 161, 202, 142, 65, 38, 53, 39, 24, 78, 71, 203, 94, 5,
      215, 32, 55, 87, 232, 118, 203, 110, 6, 197, 241, 238, 21, 86, 99, 95,
      134, 61, 190, 155, 164,
    ]),
    6,
    [
      1,
      // :20080 真实 basearr 实测: 前两组 numToNumarr2 为 2(非标准站点的 0), 见 real-basearr 反解
      ...numToNumarr2(2),
      ...numToNumarr2(2),
      config['window.document.hidden'] ? 0 : 1,
      ...encryptMode2(decrypt(ascii2string(gv.keys[22])), numarrAddTime(gv.keys[16])[0]),
      ...numToNumarr2(+decode(decrypt(ascii2string(gv.keys[22])))),
    ],
    2,
    fixedValue20(),
    9,
    [8, 0],
    13,
    [0],
  )
}

Object.assign(getBasearr, {
  adapt: ['SVRWShdBUxdKXlpaF1pWVBdaVw=='],
  'SVRWShdBUxdKXlpaF1pWVBdaVw==': {
    hasDebug: true,
    lastWord: 'P',
    flag: 1801,
    devUrl: 'UU1NSUoDFhZTVlJXU2hkQlV4ZEtYbHBhRjFwV1ZCWGRhVncW',
  },
  lens: 204, // basearr 长度随 [0]段(浏览器指纹)和 [6]段(keys[22]长度)变化, 此处为 sdenv(jsdom) 实测值
  // sdenv 补环境运行真实 VM 抓取的 basearr(204字节, jsdom指纹), 结构经反解验证:
  example: [3,73,1,0,33,128,159,173,0,238,8,77,97,99,73,110,116,101,108,0,0,16,62,52,8,0,0,1,0,0,0,0,0,0,0,3,0,4,0,3,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,121,211,210,212,0,0,0,0,0,0,0,0,0,0,0,0,10,19,1,13,106,73,98,242,81,134,13,167,0,2,220,69,46,170,144,57,4,7,12,1,0,0,0,0,0,0,0,7,9,244,70,0,61,37,133,60,244,70,165,137,110,191,227,5,13,139,94,168,149,41,30,157,8,184,218,57,163,238,94,107,75,13,50,85,191,239,149,96,24,144,175,216,7,9,235,225,60,202,103,41,161,108,154,187,18,233,116,17,12,197,94,98,117,8,6,16,1,0,2,0,2,1,100,195,22,79,72,103,1,0,0,0,2,4,103,203,101,203,9,2,8,0,13,1,0]
});

module.exports = getBasearr;
