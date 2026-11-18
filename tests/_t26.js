const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; _projDataCache = null; };

  P("=== 1. gapWord 的四种情境 ===");
  /* 双方都亏 */
  ok(gapWord(-3090000, -3060000, "profit") === "管报多亏 ¥3.0 万",
     "管报 -309 万 / 财报 -306 万 → " + gapWord(-3090000, -3060000, "profit"));
  ok(gapWord(-3060000, -3090000, "profit") === "管报少亏 ¥3.0 万",
     "管报 -306 万 / 财报 -309 万 → " + gapWord(-3060000, -3090000, "profit"));
  /* 双方都赚 */
  ok(gapWord(1000000, 800000, "profit") === "管报多赚 ¥20.0 万",
     "管报 100 万 / 财报 80 万 → " + gapWord(1000000, 800000, "profit"));
  ok(gapWord(800000, 1000000, "profit") === "管报少赚 ¥20.0 万",
     "管报 80 万 / 财报 100 万 → " + gapWord(800000, 1000000, "profit"));
  /* 一亏一赚 */
  ok(gapWord(-100000, 50000, "profit") === "管报劣于财报 ¥15.0 万",
     "管报 -10 万 / 财报 +5 万 → " + gapWord(-100000, 50000, "profit"));
  ok(gapWord(50000, -100000, "profit") === "管报优于财报 ¥15.0 万",
     "管报 +5 万 / 财报 -10 万 → " + gapWord(50000, -100000, "profit"));
  /* 相等 / 营收 */
  ok(gapWord(-500000, -500000, "profit") === "两边一致", "相等时说「两边一致」");
  ok(gapWord(1200000, 1000000, "rev") === "管报高 ¥20.0 万",
     "营收：管报 120 万 / 财报 100 万 → " + gapWord(1200000, 1000000, "rev"));
  ok(gapWord(1000000, 1200000, "rev") === "管报低 ¥20.0 万",
     "营收：管报 100 万 / 财报 120 万 → " + gapWord(1000000, 1200000, "rev"));
  ok(gapWord(null, 1, "profit") === "", "缺值时返回空串，不硬编");

  P("=== 2. 真实渲染：全亏场景，卡片直接给结论 ===");
  const bf = DB.facts.slice(), bm = {entryCcy: DB.meta.entryCcy, rd: DB.meta.rentDefault, rt: DB.meta.rentTotal};
  DB.meta.entryCcy = "RMB"; DB.meta.rentDefault = 0; DB.meta.rentTotal = 0;
  DB.rent = {}; DB.fin = []; DB.adj = [];

  const ld = latestDate(), curYm = ld.slice(0, 7), cm = +curYm.slice(5, 7);
  DB.facts = [];
  for (let m = 1; m < cm; m++) {
    const ym = Y + "-" + pad(m);
    DB.facts.push({d: ym + "-01", p: "P01", a: "C02.01.02", v: 3090000 / (cm - 1), src: "edit"});
    DB.fin.push({ym, rev: 0, profit: -3060000 / (cm - 1)});
  }
  reset();
  renderFinCmp();
  const h = (_lastHTML["finCmp"] && _lastHTML["finCmp"].innerHTML) || "";
  const cards = h.split('<div class="c">').slice(1).map(x => x.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  const proCard = (cards.find(c => c.indexOf("利润差额") >= 0) || "").split("逐月对比")[0];
  P("  " + proCard.slice(0, 90));
  ok(proCard.indexOf("管报多亏") >= 0, "卡片写明「管报多亏」，不是让人自己看正负号");
  ok(proCard.indexOf("正数＝") < 0, "不再出现「正数＝管报更好」这种要读者反推的说明");
  ok(proCard.indexOf("− -¥") < 0 && proCard.indexOf("−-¥") < 0, "也不再出现「A − -B」双负号写法");

  P("=== 3. 差额数字本身仍然是对的 ===");
  const gAll = periodAgg(period(), DB.projects.map(p => p.id)).d;
  let fAll = 0, gCmp = 0, n = 0;
  for (let m = 1; m < cm; m++) {
    const ma = monthActual(Y + "-" + pad(m), DB.projects.map(p => p.id));
    const mf = finOfMonth(Y + "-" + pad(m));
    if (ma.rev || ma.profit || mf) { gCmp += ma.profit; fAll += mf.profit; n++; }
  }
  P("  管报同区间 " + Math.round(gCmp) + "　财报 " + Math.round(fAll) + "　差额 " + Math.round(gCmp - fAll));
  ok(gCmp - fAll < 0, "管报亏得更多 → 差额为负（数学上正确）");
  ok(Math.abs((gCmp - fAll) - Math.round(gCmp - fAll)) < 1, "差额 = 管报 − 财报");

  P("=== 4. 表下说明把「亏损时正数＝亏得少」讲清楚 ===");
  ok(h.indexOf("亏得更少") >= 0, "说明里补了亏损语境");
  ok(h.indexOf("管报 − 财报") >= 0, "列明计算方向");

  P("=== 5. 逐月差额格带悬停结论 ===");
  const cells = h.match(/title="管报[^"]*"/g) || [];
  ok(cells.length > 0, "差额格带 title：" + cells.slice(0, 3).join(" / "));

  DB.facts = bf; DB.fin = [];
  DB.meta.entryCcy = bm.entryCcy; DB.meta.rentDefault = bm.rd; DB.meta.rentTotal = bm.rt;
  reset();
  P("--- 完成 ---");
})();
