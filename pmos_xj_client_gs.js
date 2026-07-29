/**
 * pmos.xj.sgcc.com.cn:20080 — got-scraping（Chrome131 TLS 指纹）变体
 *
 * 与 pmos_xj_client.js 的唯一差异：HTTP 层换成 got-scraping（headerGenerator + Chrome TLS/JA3 伪装），
 * 验证「[0] 指纹块 20-40% 通过率」是否与 Node 原生 TLS 指纹有关。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node pmos_xj_client_gs.js [N]
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

let _got = null;
async function gotScraping() {
  if (!_got) {
    const { gotScraping } = await import('got-scraping');
    _got = gotScraping.extend({
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 131, maxVersion: 131 }],
        devices: ['desktop'],
        operatingSystems: ['macos'],
      },
      https: { rejectUnauthorized: false },
      timeout: { request: 15000 },
      retry: { limit: 0 },
      throwHttpErrors: false,
    });
  }
  return _got;
}

class PmosXjClientGs {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || TARGET;
    this.ua = opts.ua || UA;
    this.maxRetries = opts.maxRetries || 25;
    this.cookieHeader = null;
    this.cookieName = null;
    this.ready = false;
    this._outerJsCode = null;
    this.stats = { attempts: 0, ok: 0, codes: {} };
  }

  async _httpGet(url, cookie) {
    const g = await gotScraping();
    const headers = { 'User-Agent': this.ua };
    if (cookie) headers['Cookie'] = cookie;
    const res = await g.get(url, { headers });
    return { status: res.statusCode, headers: res.headers, body: res.body };
  }

  async _fetchChallenge() {
    const ch = await this._httpGet(this.baseUrl);
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) throw new Error('挑战页未找到 $_ts，status=' + ch.status);
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

  /** 单次尝试（挑战页+重放全程 Chrome131 TLS） */
  async tryOnce() {
    const { nsd, cd, oCookie } = await this._fetchChallenge();
    const cp3 = this._extractCp3(nsd, cd);
    const ts = { nsd, cd, from: this.baseUrl, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
    const { cookie, name } = await this._genCookie(ts, cp3);
    const header = `${oCookie}; ${name}=${cookie}`;
    const replay = await this._httpGet(this.baseUrl, header);
    this.stats.attempts++;
    this.stats.codes[replay.status] = (this.stats.codes[replay.status] || 0) + 1;
    if (replay.status === 200) {
      this.stats.ok++;
      return { ok: true, header, name, cookie };
    }
    return { ok: false, status: replay.status };
  }

  async init() {
    console.log('[PmosXjGs] 初始化（got-scraping Chrome131 TLS），最多重试 ' + this.maxRetries + ' 次...');
    for (let t = 0; t < this.maxRetries; t++) {
      try {
        const r = await this.tryOnce();
        if (r.ok) {
          this.cookieHeader = r.header;
          this.cookieName = r.name;
          this.ready = true;
          console.log(`[PmosXjGs] ✓ 第 ${t + 1} 次尝试成功（${r.name}, ${r.cookie.length} chars）`);
          return this;
        }
        process.stdout.write(`\r[PmosXjGs] 尝试 ${t + 1}: ${r.status}，重试中...`);
      } catch (e) {
        process.stdout.write(`\r[PmosXjGs] 尝试 ${t + 1} 异常: ${String(e.message).substring(0, 50)}，重试中...`);
      }
    }
    throw new Error(`${this.maxRetries} 次尝试未获得有效 cookie`);
  }

  async get(reqPath) {
    if (!this.ready) await this.init();
    const url = reqPath.startsWith('http') ? reqPath : this.baseUrl.replace(/\/$/, '') + reqPath;
    return this._httpGet(url, this.cookieHeader);
  }

  async post(reqPath, data = {}) {
    if (!this.ready) await this.init();
    const g = await gotScraping();
    const url = reqPath.startsWith('http') ? reqPath : this.baseUrl.replace(/\/$/, '') + reqPath;
    const res = await g.post(url, {
      headers: { 'User-Agent': this.ua, 'Content-Type': 'application/json;charset=UTF-8', 'Cookie': this.cookieHeader },
      body: JSON.stringify(data),
    });
    return { status: res.statusCode, body: res.body, headers: res.headers };
  }
}

/** 通过率测试：连续 N 次独立尝试，统计 200 率 */
async function passRateTest(n) {
  const client = new PmosXjClientGs();
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    try {
      const r = await client.tryOnce();
      console.log(`#${i + 1}: ${r.ok ? '200 ✓' : r.status}`);
    } catch (e) {
      client.stats.attempts++;
      console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 60)}`);
    }
  }
  const { attempts, ok, codes } = client.stats;
  console.log('\n===== got-scraping 通过率统计 =====');
  console.log(`总尝试: ${attempts}, 200: ${ok}, 通过率: ${(ok / attempts * 100).toFixed(1)}%`);
  console.log('状态码分布:', JSON.stringify(codes));
  console.log(`耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

module.exports = { PmosXjClientGs };

if (require.main === module) {
  const n = parseInt(process.argv[2] || '15', 10);
  passRateTest(n).catch(e => { console.error('FATAL:', e); process.exit(1); });
}
