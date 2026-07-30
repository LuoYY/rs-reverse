const gv = require('@src/handler/globalVarible');
const logger = require('@utils/logger');

module.exports = function () {
  const values = [
    103, 0, 102, 203, 224,
    181, 108, 240, 101, 126,
    103, 11, 102, 203, 225,
    181, 208, 180, 100, 127
  ];
  const keys = [29, 30, 31, 32];
  const tasks = gv.r2mka("U250200532");
  for (let task of tasks) {
    const maps = values.reduce((ans, value, idx) => {
      ans[gv.ts.cp[1][task.taskori[idx * 7 + 6]]] = value;
      return ans;
    }, {})
    const data = keys.map(it => maps[gv.utils.ascii2string(gv.keys[it])]).filter(it => it !== undefined);
    if (data.length === keys.length) return data
  }
  // nx VM 兼容：taskori 结构不同时，尝试从 taskori 直接提取 4 个值
  // 使用 taskori 中前 4 个 keyname 对应的 keys 值作为回退
  if (tasks && tasks.length > 0 && tasks[0].taskori) {
    const task = tasks[0];
    const keynames = gv.ts.cp[1];
    const keyStrs = keys.map(it => gv.utils.ascii2string(gv.keys[it]));
    // 在 taskori 中查找这些 keyname 的位置，用位置索引推导值
    const result = [];
    for (const keyStr of keyStrs) {
      const knIdx = keynames.indexOf(keyStr);
      if (knIdx >= 0) {
        // 在 taskori 中找 knIdx 出现的位置
        for (let i = 6; i < task.taskori.length; i += 7) {
          if (task.taskori[i] === knIdx) {
            result.push((i - 6) / 7);
            break;
          }
        }
      }
    }
    if (result.length === 4) {
      logger.debug(`fixedValue20 nx 回退: [${result}]`);
      return result;
    }
  }
  // 最终回退：返回默认值（用于调试）
  logger.warn('fixedValue20: 使用默认值 [0,0,0,0]');
  return [0, 0, 0, 0];
}
