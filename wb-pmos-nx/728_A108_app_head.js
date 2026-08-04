const fs = require('fs');
const app = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js', 'utf8');
console.log('应用 js len:', app.length);
console.log('=== 应用 js head 1500 ===');
console.log(app.substring(0, 1500));
