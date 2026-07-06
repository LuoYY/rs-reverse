// Decode dynamic.js by replacing cp-array accesses with their values.
const fs = require('fs');
const path = require('path');
require('module-alias')(path.dirname(require('./utils/paths').package));
const gv = require('@src/handler/globalVarible');
const { initGv, getCode } = require('@utils/');

(async () => {
  const codeRet = await getCode(['example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js']);
  gv.wrap(initGv)({ file: 'output/pmos-ts.json', jsurls: codeRet });
  const cp0 = gv.cp0; // strings
  const cp2 = gv.cp2; // numbers
  let code = fs.readFileSync('output/makecode/rGTR1U4jJCVr.303c6e9-dynamic.js', 'utf8');
  // _$eF = cp0 (strings), _$j9 = cp2 (numbers) — verify and replace
  // Replace _$eF[N] with cp0[N]
  code = code.replace(/_\$eF\[(\d+)\]/g, (m, n) => {
    const v = cp0[+n];
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') return String(v);
    return m;
  });
  // Replace _$j9[N] with cp2[N] (numbers)
  code = code.replace(/_\$j9\[(\d+)\]/g, (m, n) => {
    const v = cp2[+n];
    if (typeof v === 'number') return String(v);
    return m;
  });
  fs.writeFileSync('/tmp/decoded_dynamic.js', code);
  console.log('decoded dynamic.js written to /tmp/decoded_dynamic.js, len:', code.length);
  // quick sanity: count readable strings now
  const sample = ['userAgent','cookie','document','navigator','platform','createElement','getContext','toDataURL','plugins','screen'];
  sample.forEach(s => {
    const c = (code.match(new RegExp('"'+s+'"','g')) || []).length;
    if (c > 0) console.log('  "'+s+'":', c);
  });
})();
