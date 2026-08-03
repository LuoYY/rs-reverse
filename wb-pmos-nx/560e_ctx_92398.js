/** 560e 查看 @92398 上下文（VM 上下文构造） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');
console.log('=== @92398 前后 1500 ===');
console.log(code.substring(92398 - 500, 92398 + 1000));
