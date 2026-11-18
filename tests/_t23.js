const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const CM = new Date().getMonth() + 1;
  const ym = Y + "-" + pad(CM);

  const bf = DB.facts.slice();
  const ba = JSON.parse(JSON.stringify(DB.adj || []));
  const br = JSON.parse(JSON.stringify(DB.rent || {}));
  const bm = {entryCcy: DB.meta.entryCcy, rentDefault: DB.meta.rentDefault, rentTotal: DB.meta.rentTotal};

  DB.meta.entryCcy = "RMB";
  DB.meta.rentDefault = 0; DB.meta.rentTotal = 0;
  DB.rent = {};
  DB.adj = [];

  /* 基准：营收 100、变动 60、固定 100 → 利润 -60；已录 10 / 30 天 → k = 3 */
  DB.facts = [
    {d: ym + "-01", p: "P01", a: "R02.01", v: 100, src: "edit"},
    {d: ym + "-10", p: "P01", a: "C02.01.02", v: 60, src: "edit"},
    {d: ym + "-10", p: "P01", a: "C01.01", v: 100, src: "edit"}
  ];
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; };
  const P1 = ["P01"];
  reset();

  const a0 = monthActual(ym, P1);
  P("  基准：营收 " + a0.rev + "　利润 " + a0.profit + "　利润率 " + fmtPct(a0.margin) + "　已录 " + a0.days + "/" + a0.dim + " 天");
  ok(Math.abs(a0.rev - 100) < 0.01 && Math.abs(a0.profit + 60) < 0.01, "基准就位（营收 100、亏损 60）");

  P("=== 1. 无增量时 = 纯外推 ===");
  const f0 = forecastMonth(ym, P1);
  ok(Math.abs(f0.rev - 300) < 0.5 && Math.abs(f0.profit + 180) < 0.5,
     "营收 100×3=300、利润 -60×3=-180");

  P("=== 2. 只填营收增量 → 只动营收，利润不变 ===");
  DB.adj = [{p: "P01", ym, rev: 50, profit: 0}];
  reset();
  const fR = forecastMonth(ym, P1);
  P("  营收增量 50：营收 " + Math.round(fR.rev) + "　利润 " + Math.round(fR.profit));
  ok(Math.abs(fR.rev - 350) < 0.5, "营收 300 + 50 = " + Math.round(fR.rev));
  ok(Math.abs(fR.profit - f0.profit) < 0.01, "利润不受营收增量影响：" + Math.round(fR.profit));

  P("=== 3. 只填利润增量 → 只动利润，营收不变 ===");
  DB.adj = [{p: "P01", ym, rev: 0, profit: 20}];
  reset();
  const fP = forecastMonth(ym, P1);
  P("  利润增量 20：营收 " + Math.round(fP.rev) + "　利润 " + Math.round(fP.profit));
  ok(Math.abs(fP.rev - f0.rev) < 0.01, "营收不受利润增量影响：" + Math.round(fP.rev));
  ok(Math.abs(fP.profit - (-160)) < 0.5, "利润 -180 + 20 = " + Math.round(fP.profit));

  P("=== 4. 两行都填 → 各加各的（不乘任何利润率）===");
  DB.adj = [{p: "P01", ym, rev: 50, profit: 20}];
  reset();
  const fB = forecastMonth(ym, P1);
  P("  营收 50 / 利润 20：营收 " + Math.round(fB.rev) + "　利润 " + Math.round(fB.profit));
  ok(Math.abs(fB.rev - 350) < 0.5 && Math.abs(fB.profit - (-160)) < 0.5,
     "营收 350、利润 -160，都是直接相加");
  ok(Math.abs((fB.profit - f0.profit) - 20) < 0.01, "利润改善额恰等于填的 20，没有被利润率放大或缩小");

  P("=== 5. 亏损越填越小，不再「增量越大亏越多」===");
  const seq = [0, 20, 50, 100].map(v => {
    DB.adj = [{p: "P01", ym, rev: 0, profit: v}];
    reset();
    return forecastMonth(ym, P1).profit;
  });
  P("  利润增量 0/20/50/100 → 预测利润 " + seq.map(v => Math.round(v)).join(" / "));
  ok(seq.every((v, i) => i === 0 || v > seq[i - 1]), "增量越大，预测利润单调变好");
  ok(Math.abs(seq[3] - (-80)) < 0.5, "填 100 → 亏损从 -180 收窄到 -80");

  P("=== 6. 当月没有实际明细时，预测 = 增量本身 ===");
  DB.facts = [];
  DB.adj = [{p: "P01", ym, rev: 500, profit: 80}];
  reset();
  const fE = forecastMonth(ym, P1);
  ok(Math.abs(fE.rev - 500) < 0.01 && Math.abs(fE.profit - 80) < 0.01,
     "无实际数据：营收 " + fE.rev + "、利润 " + fE.profit + "（不再恒为 0）");

  P("=== 7. 两行都清空 → 记录自动删除 ===");
  DB.facts = bf.slice();
  DB.adj = [];
  reset();
  setBp("P01", CM, "adjrev", 300, Y);
  setBp("P01", CM, "adjprofit", 60, Y);
  let rec = DB.adj.find(a => a.p === "P01" && a.ym === ym);
  ok(rec && rec.rev === 300 && rec.profit === 60, "两行分别写入：" + (rec ? rec.rev + " / " + rec.profit : "无"));
  setBp("P01", CM, "adjrev", "", Y);
  rec = DB.adj.find(a => a.p === "P01" && a.ym === ym);
  ok(rec && rec.profit === 60 && !rec.rev, "只清营收行，记录保留（利润 60 还在）");
  setBp("P01", CM, "adjprofit", "", Y);
  rec = DB.adj.find(a => a.p === "P01" && a.ym === ym);
  ok(!rec, "两行都清空后记录被删除");

  P("=== 8. 真实数据下口径自洽 ===");
  DB.facts = bf; DB.adj = ba; DB.rent = br;
  DB.meta.entryCcy = bm.entryCcy; DB.meta.rentDefault = bm.rentDefault; DB.meta.rentTotal = bm.rentTotal;
  reset();
  const real = forecastMonth(ym, projSet());
  const ra = monthActual(ym, projSet());
  const rp = adjPairOfMonth(ym, projSet());
  const k = ra.dim / ra.days;
  ok(Math.abs(real.rev - (ra.rev * k + rp.rev)) < 1,
     "营收 = 实际 " + Math.round(ra.rev) + " × " + k.toFixed(2) + " + 增量 " + Math.round(rp.rev));
  ok(Math.abs(real.profit - (ra.profit * k + rp.profit)) < 1,
     "利润 = 实际 " + Math.round(ra.profit) + " × " + k.toFixed(2) + " + 增量 " + Math.round(rp.profit));
  ok(isFinite(real.profit) && isFinite(real.rev), "结果有限");

  P("--- 完成 ---");
})();
