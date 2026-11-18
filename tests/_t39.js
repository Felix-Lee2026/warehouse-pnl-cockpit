const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

/* 未来月的「预估增量」必须进入该月预测。
   历史 bug：forecastFuture 有三个返回点（按 BP / 无基准回退 BP / 近 2 月均值），
   全都没加 adjPairOfMonth。表现就是：12 月填了增量，12 月的预估营收和利润纹丝不动。
   v0.12.6 修：三个出口统一走 addAdj。 */

(async () => {
  await init();
  const bakAdj = DB.adj;
  const reset = () => { mCache = {}; _spillCache = {}; _spreadMap = null; _lastDayCache = {}; _projDataCache = null; };
  const Y = new Date().getFullYear();
  S.year = Y; S.type = "YTD"; S.project = "ALL";
  const curYm = (() => { const l = latestActualDate(); return l ? l.slice(0, 7) : Y + "-11"; })();
  const futYm = Y + "-12";
  const projs = ["P01"];

  P("=== 0. 基线：不填增量时的 12 月预测 ===");
  DB.adj = [];
  reset();
  const base = forecastFuture(futYm, projs, curYm);
  P("  12 月基准预测：营收 " + (base.rev/1e4).toFixed(2) + " 万，利润 " + (base.profit/1e4).toFixed(2) + " 万");
  ok(isFinite(base.rev) && isFinite(base.profit), "基准值有效");

  P("=== 1. 填营收增量 → 12 月营收按数加上 ===");
  DB.adj = [{p: "P01", ym: futYm, rev: 100000, profit: 0}];
  reset();
  const f1 = forecastFuture(futYm, projs, curYm);
  ok(Math.abs(f1.rev - (base.rev + 100000)) < 1, "营收 +10 万（" + (f1.rev/1e4).toFixed(2) + " 万）");
  ok(Math.abs(f1.profit - base.profit) < 1, "利润没被营收增量带动（不折算）");

  P("=== 2. 填利润增量 → 12 月利润按数加上 ===");
  DB.adj = [{p: "P01", ym: futYm, rev: 0, profit: -50000}];
  reset();
  const f2 = forecastFuture(futYm, projs, curYm);
  ok(Math.abs(f2.profit - (base.profit - 50000)) < 1, "利润 −5 万（" + (f2.profit/1e4).toFixed(2) + " 万）");
  ok(Math.abs(f2.rev - base.rev) < 1, "营收没被利润增量带动");

  P("=== 3. 两行都填 → 各自相加，互不影响 ===");
  DB.adj = [{p: "P01", ym: futYm, rev: 100000, profit: -50000}];
  reset();
  const f3 = forecastFuture(futYm, projs, curYm);
  ok(Math.abs(f3.rev - (base.rev + 100000)) < 1 && Math.abs(f3.profit - (base.profit - 50000)) < 1,
     "营收 +10 万 / 利润 −5 万，同时生效");

  P("=== 4. 增量的作用范围：只影响填的那个月 ===");
  reset();
  const other = forecastFuture(Y + "-11", projs, curYm);
  DB.adj = [];
  reset();
  const other0 = forecastFuture(Y + "-11", projs, curYm);
  ok(Math.abs(other.rev - other0.rev) < 1, "11 月不受 12 月增量影响");

  P("=== 5. 换基准（BP 模式）也要加增量 ===");
  const oldMode = fcMode;
  fcMode = "bp";
  DB.adj = [];
  reset();
  const bpBase = forecastFuture(futYm, projs, curYm);
  DB.adj = [{p: "P01", ym: futYm, rev: 80000, profit: 30000}];
  reset();
  const bpAdj = forecastFuture(futYm, projs, curYm);
  ok(Math.abs(bpAdj.rev - (bpBase.rev + 80000)) < 1, "BP 基准下营收同样加增量");
  ok(Math.abs(bpAdj.profit - (bpBase.profit + 30000)) < 1, "BP 基准下利润同样加增量");
  fcMode = oldMode;

  P("=== 6. 时间树：12 月行显示的是加过增量的值 ===");
  const pick = () => {
    renderTimeTree();
    const html = (_lastHTML["tree"] && _lastHTML["tree"].innerHTML) || "";
    return (html.match(new RegExp("<tr[^>]*data-ym='" + futYm + "'[^>]*>([\\s\\S]*?)</tr>")) || [])[1] || "";
  };
  DB.adj = [];
  reset();
  const row0 = pick();
  DB.adj = [{p: "P01", ym: futYm, rev: 200000, profit: 120000}];
  reset();
  const row1 = pick();
  ok(row0.length > 0, "找到 " + futYm + " 行");
  ok(row1 !== row0, "填了增量后，12 月行的数字变了（不是死数）");
  /* 时间树用的是全仓项目集，用同一口径算一遍，确认界面里的就是加过增量的值 */
  const expRev = (() => {
    const v = forecastFuture(futYm, projSet(), curYm).rev;
    return (v / 10000).toLocaleString("zh-CN", {minimumFractionDigits: 1, maximumFractionDigits: 1});
  })();
  ok(row1.indexOf(expRev) >= 0, "行内的营收就是加过增量的 " + expRev + " 万");

  P("=== 7. 全年预测行跟着变 ===");
  DB.adj = [];
  reset();
  renderTimeTree();
  const h0 = (_lastHTML["tree"] && _lastHTML["tree"].innerHTML) || "";
  const fc0 = (h0.match(/全年预测[\s\S]*?<\/tr>/) || [""])[0];
  DB.adj = [{p: "P01", ym: futYm, rev: 300000, profit: 0}];
  reset();
  renderTimeTree();
  const h1 = (_lastHTML["tree"] && _lastHTML["tree"].innerHTML) || "";
  const fc1 = (h1.match(/全年预测[\s\S]*?<\/tr>/) || [""])[0];
  ok(fc0 !== fc1, "全年预测行的数字变了（不再是死数）");

  DB.adj = bakAdj; reset();
})();

/* 复用页面里的万元格式，保证断言和渲染口径一致 */
function fmtAmtTest(v){
  return (v === null || v === undefined || !isFinite(v)) ? "—"
    : (v / 10000).toLocaleString("zh-CN", {minimumFractionDigits: 1, maximumFractionDigits: 1});
}
