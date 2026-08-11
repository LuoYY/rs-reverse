// 验证：sdenv 生成的 cookie 的 base 会话段是否走 JSVMP（对比 2 次 init 的 base）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const nx = require('../nx-sdenv/nx_client');
// 尝试从 nx_client 导出 base（如果有）
const fs = require('fs');

(async () => {
  // 看 nx_client 是否有 base 相关导出
  console.log('[BP] nx_client 导出:', Object.keys(nx).join(','));
  // 2 次 init 对比 cookie
  const a = await nx.init({ log: () => {} });
  const b = await nx.init({ log: () => {} });
  console.log('[BP] A P len:', a.cookieP.length);
  console.log('[BP] B P len:', b.cookieP.length);
  // 检查 cookie 的 base 段（P cookie 解码）
  // P cookie 结构：'a' + base(加密) ...
  console.log('[BP] A P head:', a.cookieP.slice(0, 80));
  console.log('[BP] B P head:', b.cookieP.slice(0, 80));
  // 相同/不同（会话段应不同）
  console.log('[BP] A==B:', a.cookieP === b.cookieP);
  process.exit(0);
})().catch(e => { console.error('[BP] FATAL:', e.message); process.exit(1); });
