const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; };
  reset();

  const ALLP = DB.projects.map(x => x.id);
  const tot = periodAgg(period(), ALLP);
  const B = costBuckets(tot.acc);

  P("=== 1. 三个产出比 = 各自 ÷ 总成本 ===");
  const revOut = tot.d.rev / B.total;
  const cmOut = tot.d.contrib / B.total;
  const npOut = tot.d.profit / B.total;
  P("  投入 " + Math.round(B.total) + "；营收产出 " + revOut.toFixed(3) +
    "，毛益产出 " + cmOut.toFixed(3) + "，净利产出 " + npOut.toFixed(3));
  ok(Math.abs(revOut * B.total - tot.d.rev) < 1, "营收产出 × 投入 = 营收");
  ok(Math.abs(cmOut * B.total - tot.d.contrib) < 1, "毛益产出 × 投入 = 贡献毛益");
  ok(Math.abs(npOut * B.total - tot.d.profit) < 1, "净利产出 × 投入 = 利润");

  P("=== 2. 与利润率的关系 ===");
  ok(Math.abs(npOut - tot.d.margin * revOut) < 1e-9, "净利产出 = 利润率 × 营收产出");

  P("=== 3. 页面渲染 ===");
  let err = null;
  try { renderCost(); } catch (e) { err = e.message; }
  ok(!err, "renderCost 无异常" + (err ? "：" + err : ""));
  const h = (_lastHTML["cost"] && _lastHTML["cost"].innerHTML) || "";
  ok(h.indexOf("1 元投入产出") >= 0, "有投入产出块");
  ok(h.indexOf("营收产出") >= 0 && h.indexOf("贡献毛益产出") >= 0 && h.indexOf("净利产出") >= 0, "三个产出列都在");
  ok(h.indexOf(revOut.toFixed(2) + " 元") >= 0, "页面显示 " + revOut.toFixed(2) + " 元");
  ok(h.indexOf("投入成本") >= 0, "有投入成本列");

  P("=== 4. 项目行用各自成本做分母 ===");
  const pj = DB.projects.find(x => !x.pub);
  const one = periodAgg(period(), [pj.id]);
  const bj = costBuckets(one.acc);
  const expect = (one.d.rev / bj.total).toFixed(2) + " 元";
  ok(h.indexOf(expect) >= 0, pj.id + " 的营收产出 " + expect + " 出现在表里");
  ok(Math.abs(bj.spill) < 0.01, pj.id + " 不含溢出");

  P("=== 5. 期间切换 ===");
  let fail = [];
  ["YTD", "MTD", "M", "W"].forEach(ty => {
    try { S.type = ty; S.month = 11; S.week = 1; reset(); renderCost(); } catch (e) { fail.push(ty + ":" + e.message); }
  });
  ok(!fail.length, "四种期间都渲染成功" + (fail.length ? "：" + fail.join("; ") : ""));
})();
