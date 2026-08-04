const fs = require('fs');
const app = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js', 'utf8');
// 应用 js 尾部：外层 VM 的 IIFE 调用和 dynCode eval
console.log('=== 应用 js tail 1500 ===');
console.log(app.substring(app.length - 1500));
