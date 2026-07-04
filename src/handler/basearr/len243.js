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

function getBasearr(hostname, config) {
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
      0, 0,
      ...numToNumarr4(Number(hexnum('3136373737323136'))),
      ...numToNumarr4(0),
      ...numToNumarr2(config['window.innerHeight']),
      ...numToNumarr2(config['window.innerWidth']),
      ...numToNumarr2(config['window.outerHeight']),
      ...numToNumarr2(config['window.outerWidth']),
      ...numToNumarr8(0),
      ...numToNumarr4(4),
      ...numToNumarr4(0),
      ...numToNumarr4(uuid(gv.config.url.pathname.toUpperCase())),
      ...numToNumarr4(0),
      ...numToNumarr8(0),
    ),
    10,
    (() => {
      const flag = +ascii2string(gv.keys[24]);
      return [
        flag > 0 && flag < 8 ? 1 : 0,
        1,
        ...numToNumarr4(config.r2mkaTime + config.runTime - config.startTime),
        ...numToNumarr4(+ascii2string(gv.keys[19])),
        ...numToNumarr8(Math.floor((config.random || Math.random()) * 1048575) * 4294967296 + ((config.currentTime & 4294967295) >>> 0)),
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
    [
      47, 119, 54, 154, 195, 77, 48, 41, 123, 55, 111, 49, 253, 235, 248, 167,
      151, 183, 140, 71, 11, 230, 161, 113, 127, 26, 145, 122, 108, 163, 109, 13,
      107, 166, 163, 152, 211, 15, 217, 5, 133, 85, 184, 207, 114, 162, 21, 75,
      16, 65, 58, 91, 178, 2, 173, 195, 245, 45, 25, 149, 136, 73, 25, 83,
      50, 107, 38, 161, 202, 142, 65, 38, 53, 39, 24, 78, 71, 203, 94, 5,
      215, 0, 47, 4, 204, 64, 197, 121, 162, 245, 251, 216, 20, 120, 113, 45,
      36, 175, 188, 59, 229,
    ],
    6,
    [
      1,
      ...numToNumarr2(0),
      ...numToNumarr2(0),
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
    lastWord: 'P',
    flag: 1801,
    devUrl: 'UU1NSUoDFhZTVlJXU2hkQlV4ZEtYbHBhRjFwV1ZCWGRhVncW',
  },
  lens: 243,
  example: [3,73,1,0,33,128,223,134,55,216,8,77,97,99,73,110,116,101,108,0,0,15,158,13,0,0,0,1,0,0,0,0,0,0,0,3,191,4,1,4,56,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,121,211,210,212,0,0,0,0,0,0,0,0,0,0,0,0,10,18,0,1,106,72,241,49,81,133,194,50,0,2,1,136,44,238,139,79,7,12,1,0,0,0,0,0,0,0,7,9,251,7,0,101,47,119,54,154,195,77,48,41,123,55,111,49,253,235,248,167,151,183,140,71,11,230,161,113,127,26,145,122,108,163,109,13,107,166,163,152,211,15,217,5,133,85,184,207,114,162,21,75,16,65,58,91,178,2,173,195,245,45,25,149,136,73,25,83,50,107,38,161,202,142,65,38,53,39,24,78,71,203,94,5,215,0,47,4,204,64,197,121,162,245,251,216,20,120,113,45,36,175,188,59,229,6,16,1,0,0,0,0,0,93,166,22,79,72,103,1,0,0,0,2,4,103,203,101,203,9,2,8,0,13,1,0]
});

module.exports = getBasearr;
