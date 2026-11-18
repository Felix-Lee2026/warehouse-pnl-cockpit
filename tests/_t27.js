const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);
/* 源码文本由外层注入（stub 覆盖了 global.URL，运行时 readFileSync 会踩到 shim） */

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; _projDataCache = null; };

  const src = global.SRC || "";

  P("=== 1. 板块搬家：阶梯在成本页，总览换成利润 vs BP ===");
  const row2 = (src.match(/<div class="row2"[\s\S]*?\n  <\/div>/) || [""])[0];
  ok(row2.indexOf("月度营收 vs BP") >= 0, "row2 左格仍是「月度营收 vs BP」");
  ok(row2.indexOf("月度利润 vs BP") >= 0, "row2 右格新增「月度利润 vs BP」");
  ok(row2.indexOf("利润阶梯") < 0, "row2 里已经没有「利润阶梯」");
  ok(row2.indexOf('id="trendPro"') >= 0, "右格容器 #trendPro");
  ok(src.indexOf('<div class="ladder" id="ladder"') > 0, "阶梯容器改由 renderCost 输出");
  const ovCard = (src.match(/<div class="row2"[\s\S]*?\n  <\/div>/) || [""])[0];
  ok(ovCard.indexOf('id="ladder"') < 0, "总览页 DOM 里不再有 #ladder");

  P("=== 2. 两张图同尺寸（高度才对得上）===");
  renderTrend();
  const t1 = (_lastHTML["trend"] && _lastHTML["trend"].innerHTML) || "";
  renderTrendProfit();
  const t2 = (_lastHTML["trendPro"] && _lastHTML["trendPro"].innerHTML) || "";
  const vb = s => (s.match(/viewBox="([^"]+)"/) || [])[1];
  ok(vb(t1) && vb(t1) === vb(t2), "两张图 viewBox 一致：" + vb(t1));
  ok(t1.indexOf("<svg") >= 0 && t2.indexOf("<svg") >= 0, "都渲染出 SVG");

  P("=== 3. 利润图的柱子与 BP 线 ===");
  const bars = (t2.match(/<rect/g) || []).length;
  const lines = (t2.match(/<polyline/g) || []).length;
  const dots = (t2.match(/<circle/g) || []).length;
  ok(bars > 0, "实际利润柱 " + bars + " 根");
  ok(lines === 1, "BP 折线 1 条，圆点 " + dots + " 个");
  ok(t2.indexOf("#97c459") >= 0, "盈利月用绿柱");
  ok(t2.indexOf("实际利润") >= 0 && t2.indexOf("BP 利润") >= 0, "图例齐全");

  P("=== 4. 亏损月份：红柱且从零轴向下 ===");
  const bf = DB.facts.slice(), bm = {entryCcy: DB.meta.entryCcy, rd: DB.meta.rentDefault, rt: DB.meta.rentTotal};
  DB.meta.entryCcy = "RMB"; DB.meta.rentDefault = 0; DB.meta.rentTotal = 0;
  DB.rent = {}; DB.adj = []; DB.bp = [];
  /* 1、2 月盈利 10 万，3、4 月亏损 5 万 */
  DB.facts = [];
  const CM = new Date().getMonth() + 1;
  [1, 2].forEach(m => {
    DB.facts.push({d: Y + "-" + pad(m) + "-01", p: "P01", a: "R02.01", v: 100000, src: "edit"});
    DB.facts.push({d: Y + "-" + pad(m) + "-01", p: "P01", a: "C04.01", v: 0, src: "edit"});
  });
  [3, 4].forEach(m => {
    DB.facts.push({d: Y + "-" + pad(m) + "-01", p: "P01", a: "C04.01", v: 50000, src: "edit"});
  });
  reset();
  renderTrendProfit();
  const t3 = (_lastHTML["trendPro"] && _lastHTML["trendPro"].innerHTML) || "";
  ok(t3.indexOf("#e24b4a") >= 0, "亏损月出现红柱 #e24b4a");
  ok(t3.indexOf("#97c459") >= 0, "盈利月仍是绿柱");
  /* 零轴线：lo<0 且 hi>0 时应有加重的 zero line */
  ok(t3.indexOf('stroke="#cfd6de" stroke-width="1.2"') >= 0, "有零轴分隔线（利润跨零时）");

  P("=== 5. BP 只填营收、没填利润 → 不画假折线 ===");
  DB.bp = [{ym: Y + "-01", rev: 900000, profit: 0}, {ym: Y + "-02", rev: 900000, profit: 0}];
  reset();
  renderTrendProfit();
  const t4 = (_lastHTML["trendPro"] && _lastHTML["trendPro"].innerHTML) || "";
  ok(t4.indexOf("<polyline") < 0, "利润全为 0 的 BP 不画线（否则零轴上一条假线）");
  ok(t4.indexOf("BP 利润") >= 0, "图例仍标明 BP 利润");

  P("=== 6. BP 有利润时正常画线 ===");
  DB.bp = [{ym: Y + "-01", rev: 900000, profit: 80000}, {ym: Y + "-02", rev: 900000, profit: 70000}];
  reset();
  renderTrendProfit();
  const t5 = (_lastHTML["trendPro"] && _lastHTML["trendPro"].innerHTML) || "";
  ok(t5.indexOf("<polyline") >= 0, "有两个月 BP 利润 → 连线");
  ok((t5.match(/<circle/g) || []).length >= 2, "每个 BP 点有标记");

  P("=== 7. 成本页：拆解 + 阶梯并排，且阶梯被填充 ===");
  DB.facts = bf; DB.bp = []; DB.rent = {};
  DB.meta.entryCcy = bm.entryCcy; DB.meta.rentDefault = bm.rd; DB.meta.rentTotal = bm.rt;
  reset();
  renderCost();
  const ch = (_lastHTML["cost"] && _lastHTML["cost"].innerHTML) || "";
  ok(ch.indexOf("1 元营收拆解") >= 0 && ch.indexOf("利润阶梯") >= 0, "两块都在成本页");
  ok(ch.indexOf("grid-template-columns:1.3fr 1fr") >= 0, "并排用 1.3fr : 1fr 网格");
  ok(ch.indexOf('id="ladder"') >= 0, "输出阶梯容器");
  const lad = (_lastHTML["ladder"] && _lastHTML["ladder"].innerHTML) || "";
  ok(lad.indexOf("总营收") >= 0 && lad.indexOf("总利润") >= 0, "阶梯已填充：总营收 → 总利润");
  ok((lad.match(/class="lrow/g) || []).length >= 6, "阶梯行数 " + (lad.match(/class="lrow/g) || []).length);

  P("=== 8. 阶梯口径仍与 KPI 一致 ===");
  const pa = periodAgg(period(), projSet());
  ok(lad.indexOf(fmtMoney(pa.d.profit)) >= 0, "阶梯总利润 = periodAgg 利润（" + fmtMoney(pa.d.profit) + "）");
  ok(lad.indexOf(fmtMoney(pa.d.rev)) >= 0, "阶梯总营收 = periodAgg 营收");

  P("--- 完成 ---");
})();
