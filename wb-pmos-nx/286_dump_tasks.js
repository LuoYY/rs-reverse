/**
 * 286_dump_tasks.js
 *
 * dump 所有 VM 任务 UID + 分析 keys2 相关任务
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();

  const gv = require('@src/handler/globalVarible');
  const r2mka = gv.r2mka;
  console.log('r2mka 类型:', typeof r2mka);

  // 尝试直接调用 r2mka 拿所有任务
  try {
    // 可能需要 cd 初始化
    const cd = 'qWfSr1qlEk9qiqgmHqq4hfAZqk9ciAWgxuaoiAlyrOGviAAyrALqmqA3iaqyrk9micQZqk9kiAqgxugoiqgliAAqmAATHqqyqs9r';
    // 用 sync 会话
    const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
    const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
    const parser = require('@src/handler/parser');
    parser.init({ code: fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'), cd: sync.challenge.cd, nsd: sync.challenge.nsd });
    const all = gv.r2mka('');
    console.log('r2mka("") 类型:', typeof all, Array.isArray(all) ? 'len=' + all.length : '');
    if (Array.isArray(all)) {
      all.forEach((t, i) => {
        console.log('task[' + i + ']:', t.key, 'taskarr:', JSON.stringify(t.taskarr || []).substring(0, 80));
      });
    }
  } catch (e) {
    console.log('r2mka 错误:', e.message.substring(0, 80));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
