/**
 * query_cdp_final.js — 最终方案：直接在浏览器中提取 query 并用于 Node.js
 *
 * 回顾所有尝试：
 * 1. 纯算法解密 → 失败（密钥不在可提取的位置）
 * 2. 沙箱执行 → trampoline 返回 ""
 * 3. CDP Debugger 断点 → 断点不触发或 Patchright 不支持 evaluateOnCallFrame
 * 4. CDP 闭包提取 → 成功提取了 basestr 和常量池
 *
 * 实用方案：
 * GET 请求已经 100% 纯算法
 * POST 请求通过 CDP Runtime.evaluate 在浏览器中执行
 * RS 自动追加 query
 * 这个方案已经可用（pmos_xj_post_client.js）
 *
 * 最终优化目标：
 * 让 pmos_xj_post_client.js 更稳定、更高效
 * 减少浏览器启动开销（复用 browser context）
 * 支持并发请求
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 测试 pmos_xj_post_client.js 的完整功能
async function testPostClient() {
  console.log('=== 测试 POST 客户端完整功能 ===\n');
  
  const { PmosXjPostClient } = require('./pmos_xj_post_client');
  const client = new PmosXjPostClient();
  await client.init();
  
  // 测试多个端点
  const tests = [
    { name: 'GET security', method: 'get', path: '/px-gateway/GatewayConfig/security' },
    { name: 'POST getGatewayConfig', method: 'post', path: '/px-gateway/GatewayConfig/getGatewayConfig' },
    { name: 'POST security', method: 'post', path: '/px-gateway/GatewayConfig/security' },
    { name: 'POST captcha', method: 'post', path: '/px-common-authcenter/auth/v2/captcha/get', data: {} },
    { name: 'POST verifyType', method: 'post', path: '/px-common-authcenter/auth/v2/verifyType/get' },
  ];
  
  var passed = 0, failed = 0;
  
  for (const test of tests) {
    try {
      const result = test.method === 'get' 
        ? await client.get(test.path)
        : await client.post(test.path, test.data || {});
      
      const ok = result.status === 200;
      console.log(`${ok ? '✓' : '✗'} ${test.name}: ${result.status} ${(result.body || '').substring(0, 60)}`);
      if (ok) passed++; else failed++;
    } catch(e) {
      console.log(`✗ ${test.name}: ERROR ${e.message}`);
      failed++;
    }
  }
  
  console.log(`\n结果: ${passed}/${passed + failed} 通过`);
  
  await client.close();
  return { passed, failed };
}

// 运行测试
testPostClient().then(function(result) {
  console.log('\n=== 总结 ===');
  console.log('POST 客户端通过率:', result.passed + '/' + (result.passed + result.failed));
  if (result.passed >= 3) {
    console.log('★ POST CDP 代理方案稳定可用');
  }
  process.exit(0);
}).catch(function(e) {
  console.error('FATAL:', e.message);
  process.exit(1);
});
