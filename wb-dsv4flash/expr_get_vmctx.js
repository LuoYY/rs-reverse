(function(){
  var out = { err: null };
  try {
    var vmCtx = arguments[0];
    if (vmCtx && typeof vmCtx === 'object') {
      out.vmCtxKeys = [];
      out.vmCtxArrays = {};
      for (var k in vmCtx) {
        out.vmCtxKeys.push(k);
        try {
          var x = vmCtx[k];
          if (Array.isArray(x)) out.vmCtxArrays[k] = x.slice(0, 400);
          else out.vmCtxArrays['type_' + k] = typeof x;
        } catch(e) { out.vmCtxArrays['err_' + k] = e.message; }
      }
    } else {
      out.vmCtxErr = 'arg0 is ' + typeof vmCtx;
    }
  } catch(e) { out.err = e.message; }
  return JSON.stringify(out);
})()
