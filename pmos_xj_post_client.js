/**
 * pmos_xj_post_client.js — POST 请求客户端
 *
 * 通过 Patchright 浏览器代理 POST 请求
 * RS 自动生成 query 参数
 * 
 * 用法：
 *   const { PmosXjPostClient } = require('./pmos_xj_post_client');
 *   const client = new PmosXjPostClient();
 *   await client.init();
 *   const result = await client.post('/px-gateway/...', { key: 'value' });
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { chromium } = require('patchright');
const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

class PmosXjPostClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || TARGET;
    this.ua = opts.ua || UA;
    this.proxy = opts.proxy || { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
    this.browser = null;
    this.page = null;
    this.client = null;
    this.ready = false;
  }

  async init() {
    console.log('[PostClient] 启动浏览器...');
    this.browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
    this.context = await this.browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent: this.ua,
      proxy: this.proxy,
    });

    this.page = await this.context.newPage();
    this.client = await this.context.newCDPSession(this.page);
    await this.client.send('Runtime.enable');

    // 首次加载（412 → cookie 生成）
    console.log('[PostClient] 首次加载...');
    await this.page.goto(this.baseUrl, { timeout: 120000 }).catch(() => {});
    await this.page.waitForTimeout(5000);

    // Reload（200 → query 启用）
    console.log('[PostClient] Reload...');
    await this.page.reload({ timeout: 120000 }).catch(() => {});
    await this.page.waitForTimeout(10000);

    // 验证 query 是否工作
    const testResult = await this._evalCDP(`(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/px-gateway/GatewayConfig/security', false);
        xhr.send();
        return JSON.stringify({status: xhr.status, hasQuery: (xhr.responseURL||'').indexOf('r20SZOQm=')>=0});
      } catch(e) { return JSON.stringify({error: e.message.substring(0, 60)}); }
    })()`);

    const test = JSON.parse(testResult);
    if (test.status === 200 && test.hasQuery) {
      console.log('[PostClient] ✓ POST 代理就绪');
      this.ready = true;
    } else {
      console.log('[PostClient] ⚠ 测试失败:', test);
      // 再等一下重试
      await this.page.waitForTimeout(5000);
      this.ready = true;
    }

    return this;
  }

  async _evalCDP(expression) {
    const result = await this.client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });
    return result.result.value;
  }

  /** GET 请求（通过浏览器代理） */
  async get(reqPath) {
    if (!this.ready) await this.init();
    const url = reqPath.startsWith('http') ? reqPath : this.baseUrl.replace(/\/$/, '') + reqPath;
    const result = await this._evalCDP(`(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', ${JSON.stringify(reqPath)}, false);
        xhr.send();
        return JSON.stringify({status: xhr.status, body: xhr.responseText});
      } catch(e) { return JSON.stringify({error: e.message.substring(0, 80)}); }
    })()`);
    const parsed = JSON.parse(result);
    return { status: parsed.status, body: parsed.body || '', error: parsed.error };
  }

  /** POST 请求（通过浏览器代理，RS 自动追加 query） */
  async post(reqPath, data = {}) {
    if (!this.ready) await this.init();
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    const result = await this._evalCDP(`(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', ${JSON.stringify(reqPath)}, false);
        xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        xhr.send(${JSON.stringify(body)});
        return JSON.stringify({status: xhr.status, body: xhr.responseText, url: xhr.responseURL || ''});
      } catch(e) { return JSON.stringify({error: e.message.substring(0, 80)}); }
    })()`);
    const parsed = JSON.parse(result);
    return { status: parsed.status, body: parsed.body || '', url: parsed.url || '', error: parsed.error };
  }

  /** 关闭浏览器 */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = { PmosXjPostClient };

// 如果直接运行，执行演示
if (require.main === module) {
  (async () => {
    const client = new PmosXjPostClient();
    await client.init();

    console.log('\n=== 演示 ===');

    // GET
    const r1 = await client.get('/px-gateway/GatewayConfig/security');
    console.log('GET security:', r1.status, r1.body.substring(0, 80));

    // POST
    const r2 = await client.post('/px-gateway/GatewayConfig/getGatewayConfig');
    console.log('POST getGatewayConfig:', r2.status, r2.body.substring(0, 80));

    // POST with body
    const r3 = await client.post('/px-common-authority/marketMapping/selectByCondition', { pageNum: 1, pageSize: 10 });
    console.log('POST selectByCondition:', r3.status, r3.body.substring(0, 80));

    // POST captcha
    const r4 = await client.post('/px-common-authcenter/auth/v2/captcha/get', {});
    console.log('POST captcha/get:', r4.status, r4.body.substring(0, 80));

    await client.close();
    process.exit(0);
  })().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
}
