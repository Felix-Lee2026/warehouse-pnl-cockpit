const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

/* 当月「已录天数」的口径。
   根因：日录入台的「月合计」会把整月金额按 1–30 号铺平（src=auto），
   于是 lastDayOf 返回当月最后一天，days 一跳满 → 外推系数 dim/days = 1
   → 实际直接等于整月，仓租按整月计入，「实际」和「预测」显示成同一个数。
   当月不可能有未来日期的「实际」，所以必须截到今天。 */

(async () => {
  await init();
  const now = new Date();
  const Y = now.getFullYear(), M = now.getMonth() + 1;
  const curYm = Y + "-" + pad(M);
  const dim = daysInMonth(Y, M);
  const todayD = now.getDate();
  const bak = DB.facts;

  const fill = (ym, n, src) => {
    const out = [];
    for (let d = 1; d <= n; d++) out.push({d: ym + "-" + pad(d), p: "P01", a: "R02.04", v: 1000, src: src || "auto"});
    return out;
  };
  const reset = () => { _lastDayCache = {}; mCache = {}; _spreadMap = null; _projDataCache = null; };

  P("=== 1. 当月：摊平写满整月，实际天数必须截到今天 ===");
  P("  今天是 " + curYm + "-" + pad(todayD) + "，当月共 " + dim + " 天");
  DB.facts = fill(curYm, dim);                 /* 月合计摊平：1..dim 全有 */
  reset();
  const sp1 = monthSpan(curYm, ["P01"]);
  ok(sp1.days === Math.min(dim, todayD), "已录天数 = min(最后数据日, 今天) = " + sp1.days);
  ok(sp1.to === curYm + "-" + pad(sp1.days), "聚合止于 " + sp1.to + "（不会算到月底）");
  if (todayD < dim) {
    ok(sp1.capped === dim, "capped 记录被截掉的最后日期 " + sp1.capped + "（仅用于提示）");
    ok(sp1.days < sp1.capped, "修好时 days(" + sp1.days + ") < capped(" + sp1.capped + ")");
  } else {
    P("  （今天是月末，跳过 capped 断言）");
  }

  P("=== 2. 当月：只录到某一天（正常逐日录入）===");
  const onlyTo = Math.min(3, todayD);
  DB.facts = fill(curYm, onlyTo, "edit");
  reset();
  const sp2 = monthSpan(curYm, ["P01"]);
  ok(sp2.days === onlyTo, "只录到 " + onlyTo + " 号 → days=" + sp2.days);
  ok(!sp2.capped, "没有超过今天的记录 → capped 为空");

  P("=== 3. 当月：完全没有数据 ===");
  DB.facts = [];
  reset();
  const sp3 = monthSpan(curYm, ["P01"]);
  ok(sp3.days === 0, "无数据 → days=0（不误判成今天）");
  ok(sp3.to === curYm + "-01", "聚合区间退到 1 号");

  P("=== 4. 历史月不受影响（仍按整月）===");
  const pastYm = (M === 1) ? (Y - 1) + "-12" : Y + "-" + pad(M - 1);
  const pastDim = daysInMonth(+pastYm.slice(0, 4), +pastYm.slice(5, 7));
  DB.facts = fill(pastYm, 1, "auto");          /* 历史月月度汇总记在 1 号 */
  reset();
  const sp4 = monthSpan(pastYm, ["P01"]);
  ok(sp4.days === pastDim, "历史月 " + pastYm + " 按整月 " + pastDim + " 天（汇总记在 1 号也不截断）");
  ok(sp4.full === true, "标记 full");

  P("=== 5. 未来月 ===");
  const futYm = (M === 12) ? (Y + 1) + "-01" : Y + "-" + pad(M + 1);
  DB.facts = fill(futYm, 3, "auto");
  reset();
  const sp5 = monthSpan(futYm, ["P01"]);
  ok(sp5.days === 0, "未来月 days=0，不把预录当真");

  P("=== 6. 实际 vs 预测：修好后不再重合 ===");
  if (todayD < dim) {
    DB.facts = fill(curYm, dim);
    reset();
    const a = monthActual(curYm, ["P01"]);
    const f = forecastMonth(curYm, ["P01"]);
    const adj = adjPairOfMonth(curYm, ["P01"]);
    ok(a.days === todayD, "实际口径 " + a.days + " 天");
    ok(f.days === todayD, "预测也用同一个 days");
    const k = dim / a.days;
    /* forecastMonth = 实际 × dim/days + 增量，增量不能漏 */
    ok(Math.abs(f.rev - (a.rev * k + adj.rev)) < 1,
       "预测 = 实际 × " + dim + "/" + a.days + " + 增量（系数 " + k.toFixed(3) + "，增量 " + adj.rev.toFixed(0) + "）");
    ok(Math.abs(f.rev - a.rev) > 1, "预测(" + f.rev.toFixed(0) + ") ≠ 实际(" + a.rev.toFixed(0) + ")，不再重合");
  } else {
    P("  （今天是月末，外推系数为 1，跳过）");
  }

  P("=== 7. capped 不参与任何计算 ===");
  DB.facts = fill(curYm, dim);
  reset();
  const sp7 = monthSpan(curYm, ["P01"]);
  const a7 = monthActual(curYm, ["P01"]);
  const fullRev = (() => {          /* 对照：假设不截断、按整月 30 天 */
    const acc = {};
    for (let d = 1; d <= dim; d++) {
      const k = "R02.04";
      acc[k] = (acc[k] || 0) + fxToRMB(1000, curYm);
    }
    return derive(acc).rev;
  })();
  ok(sp7.capped === 0 || typeof sp7.capped === "number", "capped 只是数字字段，无副作用");
  ok(a7.rev < fullRev * 0.999, "营收只累加 " + sp7.days + " 天（" + a7.rev.toFixed(0) + " < 整月 " + fullRev.toFixed(0) + "）");

  DB.facts = bak;
  reset();
})();
