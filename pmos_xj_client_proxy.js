/**
 * pmos_xj_client_proxy.js — 代理版本的 pmos_xj_client
 * 复用 pmos_xj_client 的管线逻辑，但 HTTP 请求走代理
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs');
const path = require('path');
const { httpGet, httpPost } = require('./proxy_http');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

class PmosXjClientProxy {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || TARGET;
    this.ua = opts.ua || UA;
    this.maxRetries = opts.maxRetries || 5;
    this.cookieHeader = null;
    this.cookieName = null;
    this.ready = false;
    this._outerJsCode = null;
  }

  async _fetchChallenge() {
    const ch = await httpGet(this.baseUrl, { userAgent: this.ua });
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) throw new Error(`挑战页未找到 $_ts，status=${ch.status}`);
    const setCookies = [].concat(ch.headers['set-cookie'] || []);
    const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
    return { nsd: +m[1], cd: m[2], oCookie };
  }

  _extractCp3(nsd, cd) {
    if (!this._outerJsCode) this._outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
    const { runOuterVM } = require('./extract_dyncode_20080.js');
    const r = runOuterVM({ nsd, cd }, this._outerJsCode);
    if (!r.cp3) throw new Error('沙箱未提取到 cp3');
    return r.cp3;
  }

  async _genCookie(ts, cp3) {
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(path.dirname(require('./utils/paths').package));
    const gv = require('@src/handler/globalVarible');
    const { getCode } = require('@utils/');
    const tmpTs = '/tmp/pmos-xj-ts.json';
    fs.writeFileSync(tmpTs, JSON.stringify(ts));
    const argv = { file: tmpTs, jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
    const codeRet = await getCode(argv.jsurls);
    argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
    gv._setAttr('argv', argv);
    require('@src/config/')(gv);
    gv._setAttr('_ts', ts);
    const Coder = require('@src/handler/Coder');
    const Cookie = require('@src/handler/Cookie');
    const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
    const { $_ts: fullTs, codemap } = coder.run();
    fullTs.cp[3] = cp3;
    gv.config.codemap = codemap;
    const cookie = new Cookie(coder).run();
    const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
    return { cookie, name };
  }

  async init() {
    console.log('[PmosXj-Proxy] 初始化...');
    for (let t = 0; t < this.maxRetries; t++) {
      try {
        const { nsd, cd, oCookie } = await this._fetchChallenge();
        const cp3 = this._extractCp3(nsd, cd);
        const ts = { nsd, cd, from: this.baseUrl, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
        const { cookie, name } = await this._genCookie(ts, cp3);
        const header = `${oCookie}; ${name}=${cookie}`;
        const replay = await httpGet(this.baseUrl, { userAgent: this.ua, headers: { Cookie: header } });
        if (replay.status === 200) {
          this.cookieHeader = header;
          this.cookieName = name;
          this.ready = true;
          console.log(`[PmosXj-Proxy] ✓ 第 ${t + 1} 次成功 (${name}, ${cookie.length} chars)`);
          return this;
        }
        console.log(`[PmosXj-Proxy] 尝试 ${t + 1}: ${replay.status}`);
      } catch (e) {
        console.log(`[PmosXj-Proxy] 尝试 ${t + 1} 异常: ${e.message.substring(0, 60)}`);
      }
    }
    throw new Error(`${this.maxRetries} 次尝试未获得有效 cookie`);
  }
}

module.exports = { PmosXjClientProxy };
