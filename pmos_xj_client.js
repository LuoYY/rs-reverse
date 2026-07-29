/**
 * pmos.xj.sgcc.com.cn:20080 — 瑞数 VMP 纯算法生产客户端
 *
 * 纯协议 Node.js（无浏览器依赖）：
 *   拉 412 挑战页解析 $_ts(nsd/cd) → 沙箱执行外层 VM 提取动态代码/cp[3]
 *   → 管线 cd解密→keys→basearr→cookie → 重放（含重试，[0] 指纹块与 TLS 校验有概率性）
 *   → 一旦 cookie 通过(200)即可稳定用于后续 API
 *
 * 用法：
 *   NODE_OPTIONS=--dns-result-order=ipv4first node pmos_xj_client.js
 *   const { PmosXjClient } = require('./pmos_xj_client');
 *   const client = new PmosXjClient();
 *   await client.init();                       // 获取有效 cookie（自动重试）
 *   const resp = await client.get('/px-gateway/...');
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

class PmosXjClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || TARGET;
    this.ua = opts.ua || UA;
    this.maxRetries = opts.maxRetries || 25;   // [0] 指纹校验概率性，需重试
    this.cookieHeader = null;
    this.cookieName = null;
    this.ready = false;
    this._outerJsCode = null;
  }

  _httpGet(url, cookie) {
    return new Promise((resolve) => {
      const headers = { 'User-Agent': this.ua, 'Accept': '*/*' };
      if (cookie) headers['Cookie'] = cookie;
      https.get(url, { rejectUnauthorized: false, headers }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', (e) => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
    });
  }

  /** 拉挑战页解析 $_ts + O cookie */
  async _fetchChallenge() {
    const ch = await this._httpGet(this.baseUrl);
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) throw new Error('挑战页未找到 $_ts（可能已直接 200 或网络异常），status=' + ch.status);
    const setCookies = [].concat(ch.headers['set-cookie'] || []);
    const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
    return { nsd: +m[1], cd: m[2], oCookie };
  }

  /** 沙箱执行外层 VM 提取 cp[3]（用真实 nsd） */
  _extractCp3(nsd, cd) {
    if (!this._outerJsCode) this._outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
    const { runOuterVM } = require('./extract_dyncode_20080.js');
    const r = runOuterVM({ nsd, cd }, this._outerJsCode);
    if (!r.cp3) throw new Error('沙箱未提取到动态代码/cp3');
    return r.cp3;
  }

  /** 管线生成 cookie（清 require 缓存避免 gv 污染） */
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

  /** 初始化：重试直到拿到 200 的有效 cookie */
  async init() {
    console.log('[PmosXj] 初始化，获取有效 cookie（最多重试 ' + this.maxRetries + ' 次）...');
    for (let t = 0; t < this.maxRetries; t++) {
      try {
        const { nsd, cd, oCookie } = await this._fetchChallenge();
        const cp3 = this._extractCp3(nsd, cd);
        const ts = { nsd, cd, from: this.baseUrl, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
        const { cookie, name } = await this._genCookie(ts, cp3);
        const header = `${oCookie}; ${name}=${cookie}`;
        const replay = await this._httpGet(this.baseUrl, header);
        if (replay.status === 200) {
          this.cookieHeader = header;
          this.cookieName = name;
          this.ready = true;
          console.log(`[PmosXj] ✓ 第 ${t + 1} 次尝试成功，cookie 有效（${name}, ${cookie.length} chars）`);
          return this;
        }
        process.stdout.write(`\r[PmosXj] 尝试 ${t + 1}: ${replay.status}，重试中...`);
      } catch (e) {
        process.stdout.write(`\r[PmosXj] 尝试 ${t + 1} 异常: ${e.message.substring(0, 40)}，重试中...`);
      }
    }
    throw new Error(`${this.maxRetries} 次尝试未获得有效 cookie`);
  }

  /** GET 请求（带有效 cookie） */
  async get(reqPath) {
    if (!this.ready) await this.init();
    const url = reqPath.startsWith('http') ? reqPath : this.baseUrl.replace(/\/$/, '') + reqPath;
    return this._httpGet(url, this.cookieHeader);
  }

  /** POST 请求 */
  async post(reqPath, data = {}) {
    if (!this.ready) await this.init();
    const url = reqPath.startsWith('http') ? reqPath : this.baseUrl.replace(/\/$/, '') + reqPath;
    return new Promise((resolve) => {
      const u = new URL(url);
      const body = JSON.stringify(data);
      const req = https.request({
        hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST',
        rejectUnauthorized: false,
        headers: { 'User-Agent': this.ua, 'Content-Type': 'application/json;charset=UTF-8', 'Content-Length': Buffer.byteLength(body), 'Cookie': this.cookieHeader },
      }, (res) => { let b = ''; res.on('data', (c) => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers })); });
      req.on('error', (e) => resolve({ status: 'ERR', error: e.message, body: '' }));
      req.write(body); req.end();
    });
  }
}

// ---- demo ----
async function main() {
  const client = new PmosXjClient();
  await client.init();
  console.log('\n[demo] 访问 / ...');
  const r1 = await client.get('/');
  console.log('  / →', r1.status, 'len=', r1.body.length);
  console.log('\n[demo] 访问 API /px-gateway/GatewayConfig/getGatewayConfig ...');
  const r2 = await client.get('/px-gateway/GatewayConfig/getGatewayConfig');
  console.log('  API →', r2.status, 'body 前 150:', (r2.body || '').substring(0, 150));
}

module.exports = { PmosXjClient };
if (require.main === module) {
  main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
}
