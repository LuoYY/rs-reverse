const logger = require('@utils/logger');
const parser = require('./parser/');
const gv = require('./globalVarible');
const getBasearr = require('./basearr');

const {
  numToNumarr4,
  uuid,
  ascii2string,
  numarrAddTime,
  encryptMode1,
  numarrJoin,
  numarr2string,
  numarrEncrypt,
  xor,
} = parser;

module.exports = class {
  constructor(coder) {
    this.coder = coder;
    parser.init(coder)
    this.config = { ...gv.makecookieRuntimeConfig };
    if (!this.config.codeUid) this.config.codeUid = this.getCodeUid();
    if (!this.config.r2mkaTime) this.config.r2mkaTime = +ascii2string(gv.keys[21]);
    // console.log(this.config);
  }

  run() {
    const basearr = getBasearr(this.config, gv);
    logger.info(`basearr【${basearr.length}】: [${basearr}]`)
    const basearrEncrypt = encryptMode1(
      xor(
        numarrEncrypt(basearr),
        gv.keys[2],
        16
      ),
      numarrAddTime(gv.keys[17], this.config.runTime, this.config.random)[0],
      0
    )
    const nextarr = numarrJoin(
      numarrJoin(
        2,
        numToNumarr4([this.config.r2mkaTime, this.config.startTime]),
        gv.keys[2]
      ),
      gv.config.adapt?.hasDebug ? basearrEncrypt.length >> 8 & 255 | 128 : undefined,
      basearrEncrypt,
    )
    if (process.env.DEBUG_COOKIE) {
      console.log('[Cookie] runTime=' + this.config.runTime, 'random=' + this.config.random, 'keys16=' + (gv.keys[16] || []).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '), 'keys2=' + (gv.keys[2] || []).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '), 'basearr=' + basearr.length, 'nextarr=' + nextarr.length);
    }
    return (gv.config.adapt?.cookiePrefix || '0') + numarr2string(
      encryptMode1(
        [
          ...numToNumarr4(uuid(nextarr)),
          ...nextarr
        ],
        numarrAddTime(gv.keys[16], this.config.runTime, this.config.random)[0],
        1,
        this.config.random
      ),
      gv.config.adapt?.basestr ? gv.config.adapt.basestr.split('') : undefined
    );
  }

  getCodeUid() {
    const mainFunctionCode = this.coder.code.slice(...this.coder.mainFunctionIdx);
    const funcIdx = +ascii2string(gv.keys[33]);
    // nx VM: keys[33] 可能因 task offset 偏移而损坏，回退到索引 20（经浏览器捕获验证）
    const validIdx = (!isNaN(funcIdx) && funcIdx < this.coder.functionsNameSort.length) ? funcIdx : 20;
    const funcEntry = this.coder.functionsNameSort[validIdx];
    const one = funcEntry && funcEntry.code ? uuid(funcEntry.code) : uuid(mainFunctionCode.substring(0, 100));
    const len = parseInt(mainFunctionCode.length / 100);
    const start = len * (+ascii2string(gv.keys[34]) || 0);
    const two = uuid(mainFunctionCode.substr(start, len))
    return (one ^ two) & 65535;
  }
}
