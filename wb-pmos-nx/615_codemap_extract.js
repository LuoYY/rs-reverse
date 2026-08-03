/**
 * 615_codemap_extract.js
 * 提取 nx 外层 JS 的 codemap，查找 basearr 生成相关任务
 * xb 的 basearr 由外层 Coder（codemap）生成，nx 应该同体系
 * 查找：U14124020（xb basearr 相关）或 fixedValue20 的 U250200532 等价任务
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const code = fs.readFileSync(OUTER_JS, 'utf8');
console.log('外层 JS len:', code.length);

// 查找 basearr 相关关键词
const keywords = ['14124020', '250200532', 'basearr', 'numarr', 'fixedValue20', 'getKey', 'Encrypt'];
for (const kw of keywords) {
  const idxs = [];
  let i = 0;
  while ((i = code.indexOf(kw, i)) !== -1) { idxs.push(i); i += kw.length; }
  if (idxs.length) {
    console.log(`\n${kw}: ${idxs.length} 次`, idxs.slice(0, 5).join(','));
    // 打印上下文
    for (const idx of idxs.slice(0, 2)) {
      console.log(`  @${idx}: ${code.substring(Math.max(0, idx - 80), idx + 80).replace(/\n/g, ' ')}`);
    }
  }
}

// 尝试 getCodemap 提取（可能需要 sdenv-extract）
try {
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const getCodemap = require(path.join(ROOT, 'utils/getCodemap'));
  const cm = getCodemap(code);
  console.log('\ncodemap keys:', Object.keys(cm).join(','));
  // 找 U 开头任务
  const uTasks = Object.keys(cm).filter(k => /^U\d+$/.test(k));
  console.log('U 任务数:', uTasks.length);
  // 找 basearr 相关（14124020）
  if (cm['U14124020']) {
    console.log('\nU14124020 存在!');
    fs.writeFileSync('/tmp/nx_U14124020.txt', cm['U14124020']);
    console.log(cm['U14124020'].substring(0, 500));
  }
  fs.writeFileSync('/tmp/nx_codemap.json', JSON.stringify(cm));
} catch (e) {
  console.log('getCodemap 失败:', e.message.substring(0, 100));
}
