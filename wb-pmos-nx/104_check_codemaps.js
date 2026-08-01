process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const ifConditional2switch = require('sdenv-extract/src/plugins/ifConditional2switch');
  const code = fs.readFileSync('/tmp/nx_rebuilt.js', 'utf8');
  const result = ifConditional2switch(null, { input: code });
  for (let i = 0; i < result.length; i++) {
    const r = result[i];
    if (r.path.indexOf('_codemap_') >= 0) {
      const cm = JSON.parse(r.content);
      const keys = Object.keys(cm);
      const strKeys = keys.filter(k => typeof cm[k] === 'string');
      console.log('path:', r.path, '总keys:', keys.length, 'str:', strKeys.length, 'commonFunc:', (cm.commonFunc || '').length);
      // 检查 U14124020 taskarr 的 51,56,14
      for (const t of ['51', '56', '14', '2', '57', '0']) {
        console.log('  [' + t + ']:', cm[t] ? cm[t].substring(0, 70).replace(/\n/g, ' ') : '无');
      }
      // 检查 _$cc/_$aq
      const all = JSON.stringify(cm);
      console.log('  含 _$cc[_$aq:', all.includes('_$cc[_$aq'), '_$cc:', all.includes('_$cc'), '_$aq:', all.includes('_$aq'));
    }
  }
  process.exit(0);
})().catch(e => { console.error('ERR:', e.message, e.stack); process.exit(1); });
