/**
 * query_gen_module.js — 瑞数 VMP 纯算法 query 参数生成模块（可复用）
 *
 * 用法：
 *   const { PmosQueryClient } = require('./wb-dsv4flash/query_gen_module.js');
 *   const client = new PmosQueryClient();
 *   await client.init();                    // 拉挑战 + 管线 → cookie 有效
 *   const r = await client.post('/px-gateway/GatewayConfig/getGatewayConfig', {a:1});
 *   const r2 = await client.get('/px-gateway/GatewayConfig/security');
 *
 * 依赖：管线（src/handler）、extract_dyncode_20080.js、example/pmos.xj.sgcc.com.cn/*.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

// 站点固定掩码（prefix[0..7] 服务器校验，跨会话恒定）
const PREFIX_MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];

function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}

function httpReq(url, opts = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      method: opts.method || 'GET', rejectUnauthorized: false, headers: opts.headers || {},
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, headers: {}, body: '' }));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

class PmosQueryClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || TARGET;
    this.ua = opts.ua || UA;
    this.ready = false;
    this._gv = null;
  }

  /** 初始化会话（拉挑战 + 管线 → cookie + keys） */
  async init() {
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));

    const ch = await httpReq(this.baseUrl);
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) throw new Error('挑战页无 $_ts: ' + ch.status);
    const nsd = +m[1], cd = m[2];
    const oCookie = [].concat(ch.headers['set-cookie'] || []).map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';

    const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
    const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
    if (!r.cp3) throw new Error('cp3 提取失败');

    const gv = require('@src/handler/globalVarible');
    const { getCode } = require('@utils/');
    const ts = { nsd, cd, from: this.baseUrl, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
    fs.writeFileSync('/tmp/pmos-query-ts.json', JSON.stringify(ts));
    const argv = { file: '/tmp/pmos-query-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
    const codeRet = await getCode(argv.jsurls);
    argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
    gv._setAttr('argv', argv);
    require('@src/config/')(gv);
    gv._setAttr('_ts', ts);
    const Coder = require('@src/handler/Coder');
    const Cookie = require('@src/handler/Cookie');
    const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
    const { $_ts: fullTs, codemap } = coder.run();
    fullTs.cp[3] = r.cp3;
    gv.config.codemap = codemap;
    const cookie = new Cookie(coder).run();
    const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
    this.paramName = gv.utils.ascii2string(gv.keys[7]).split(';')[1];
    this.cookieHeader = `${oCookie}; ${name}=${cookie}`;
    this._gv = gv;

    // 验证 cookie
    const replay = await httpReq(this.baseUrl, { headers: { 'User-Agent': this.ua, 'Cookie': this.cookieHeader } });
    if (replay.status !== 200) throw new Error('cookie 无效: ' + replay.status);
    this.ready = true;
    return this;
  }

  /** 生成 query */
  genQuery(url) {
    if (!this.ready) throw new Error('未初始化');
    const gv = this._gv;
    const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
    const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
    const numarr2string = require('@src/handler/parser/common/numarr2string');
    require('@src/handler/parser/constData').init();

    const keys2 = gv.keys[2], keys17 = gv.keys[17], basestr = gv.basestr;
    const [key21] = numarrAddTime([...keys17], Math.floor(Date.now() / 1000), Math.random());
    const randByte = () => Math.floor(Math.random() * 256);
    const crcUrl = crc32b(Buffer.from(url.toUpperCase()));
    const plain24 = [
      keys2[0] ^ PREFIX_MASK[0], keys2[1] ^ PREFIX_MASK[1], keys2[2], keys2[3] ^ PREFIX_MASK[3],
      keys2[4], keys2[5] ^ PREFIX_MASK[5], keys2[6], keys2[7] ^ PREFIX_MASK[7],
      randByte(), randByte(), randByte(), randByte(), randByte(),
      randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
      (crcUrl >>> 24) & 255, (crcUrl >>> 16) & 255, (crcUrl >>> 8) & 255, crcUrl & 255,
    ];
    const requestData = encryptMode1(plain24, key21, 0);
    const body = [1, 0, 48, ...keys2, 32, ...requestData];
    const crc = crc32b(Buffer.from(body));
    return '0' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], basestr.split(''));
  }

  async _req(reqPath, method, body) {
    if (!this.ready) await this.init();
    const base = this.baseUrl.replace(/\/$/, '');
    const query = this.genQuery(reqPath);
    const headers = { 'User-Agent': this.ua, 'Content-Type': 'application/json;charset=UTF-8', 'Cookie': this.cookieHeader };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    return httpReq(base + reqPath + '?' + this.paramName + '=' + encodeURIComponent(query), { method, headers, body });
  }

  async get(reqPath) { return this._req(reqPath, 'GET'); }
  async post(reqPath, data = {}) { return this._req(reqPath, 'POST', JSON.stringify(data)); }
}

module.exports = { PmosQueryClient };
