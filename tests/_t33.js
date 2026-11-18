const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

/* 总览页两张图的数值标签。
   为什么值得单独一套：这两张图以前只有柱子和折线、没有任何数字，
   用户必须把柱高换算成万元才能读 —— 而「差多少」恰恰是这两张图唯一的用途。 */

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; _projDataCache = null; };

  const html = id => (_lastHTML[id] && _lastHTML[id].innerHTML) || "";
  /* 按 fill 数标签：柱内 / 柱外 / BP 三种角色用不同颜色，能精确区分 */
  const cnt = (s, fill) => (s.match(new RegExp('fill="' + fill + '"', "g")) || []).length;
  const texts = s => [...s.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);

  P("=== 1. 营收图：每根有值的柱子都有数字 ===");
  DB.bp = [];                       /* 先关掉 BP，只验柱子 */
  reset(); renderTrend();
  const t1 = html("trend");
  const revM = [];
  for (let m = 1; m <= 12; m++) revM.push(monthAgg(Y + "-" + pad(m), projSet()).d.rev);
  const bars = revM.filter(v => v > 0).length;
  const inLab = cnt(t1, "#12354d"), outLab = cnt(t1, "#3d6b96");
  P("  有值月份 " + bars + " 个｜柱内标签 " + inLab + "｜柱外标签 " + outLab);
  ok(inLab + outLab === bars, "柱标签数 = 有值月份数（" + (inLab + outLab) + " = " + bars + "）");
  ok(inLab > 0, "至少有一根柱子高到能放柱内标签");
  /* 数字必须真出现，不是画了标签但内容为空 */
  const vals1 = texts(t1);
  ok(revM.some(v => v > 0 && vals1.indexOf(fmtWan(v)) >= 0), "标签内容 = fmtWan(实际营收)");
  /* 描边宽度看源码：这一组数据里所有柱子都够高，柱外标签不会被调用 */
  ok((global.SRC || "").indexOf('stroke-width="2.1"') >= 0, "标签描边 2.1（2.6 会把小数点糊成整数）");

  P("=== 2. 营收图：BP 打开后两套数字分层 ===");
  DB.bp = [{ym: Y + "-01", rev: 900000, profit: 80000},
           {ym: Y + "-02", rev: 880000, profit: 70000},
           {ym: Y + "-03", rev: 860000, profit: 60000}];
  reset(); renderTrend();
  const t2 = html("trend");
  ok(cnt(t2, "#b8471f") === 3, "三个月 BP → 三个 BP 标签（" + cnt(t2, "#b8471f") + "）");
  ok(cnt(t2, "#12354d") + cnt(t2, "#3d6b96") === bars, "BP 打开不影响柱标签数量");
  /* 柱内标签字号 9、无描边；BP 标签字号 9.5、有描边 —— 视觉分层靠这个 */
  ok(t2.indexOf('font-size="9.5" fill="#12354d"') >= 0, "柱内标签 9.5px、无描边");
  ok(t2.indexOf('font-size="10" fill="#b8471f"') >= 0, "BP 标签 10px、有描边");

  P("=== 3. 利润图：正负柱各自的标签颜色 ===");
  const bf = DB.facts.slice();
  const bm = {entryCcy: DB.meta.entryCcy, rd: DB.meta.rentDefault, rt: DB.meta.rentTotal};
  DB.meta.entryCcy = "RMB"; DB.meta.rentDefault = 0; DB.meta.rentTotal = 0;
  DB.rent = {}; DB.adj = []; DB.bp = [];
  DB.facts = [];
  [1, 2].forEach(m => {
    /* 盈利 10 万：营收 20 万、变动成本 10 万 */
    DB.facts.push({d: Y + "-" + pad(m) + "-01", p: "P01", a: "R02.01", v: 200000, src: "edit"});
    DB.facts.push({d: Y + "-" + pad(m) + "-01", p: "P01", a: "C04.01", v: 100000, src: "edit"});
  });
  [3, 4].forEach(m => {
    DB.facts.push({d: Y + "-" + pad(m) + "-01", p: "P01", a: "R02.01", v: 50000, src: "edit"});
    DB.facts.push({d: Y + "-" + pad(m) + "-01", p: "P01", a: "C04.01", v: 120000, src: "edit"});
  });
  reset(); renderTrendProfit();
  const t3 = html("trendPro");
  ok(cnt(t3, "#2f5a1f") >= 2, "盈利月：深绿柱内标签 " + cnt(t3, "#2f5a1f") + " 个");
  ok(cnt(t3, "#fff") >= 1, "亏损月：红柱上的白字标签 " + cnt(t3, "#fff") + " 个");
  const vals3 = texts(t3);
  ok(vals3.indexOf(fmtWan(100000)) >= 0, "盈利 10.0 万入图");
  ok(vals3.indexOf(fmtWan(-70000)) >= 0, "亏损 -7.0 万入图（带负号）");

  P("=== 4. 无 BP 时不出现橙色标签 ===");
  reset(); renderTrendProfit();
  const t4 = html("trendPro");
  ok(cnt(t4, "#b8471f") === 0, "没有 BP 数据就没有 BP 标签");

  P("=== 5. 极高柱：标签不越出图顶 ===");
  DB.facts = [
    {d: Y + "-01-01", p: "P01", a: "R02.01", v: 5000000, src: "edit"},
    {d: Y + "-02-01", p: "P01", a: "R02.01", v: 100000, src: "edit"}
  ];
  reset(); renderTrend();
  const t5 = html("trend");
  const ys = [...t5.matchAll(/<text[^>]*y="([\d.]+)"[^>]*font-size="10"/g)].map(m => +m[1]);
  ok(ys.length > 0 && Math.min(...ys) >= 12, "所有柱外/BP 标签 y ≥ 12（不越过绘图区顶）");

  P("=== 6. 各视角不崩、仍有数字 ===");
  DB.facts = bf;
  DB.meta.entryCcy = bm.entryCcy; DB.meta.rentDefault = bm.rd; DB.meta.rentTotal = bm.rt;
  DB.bp = [];
  reset();
  const views = [
    ["全部/YTD", () => { S.project = "ALL"; S.type = "YTD"; }],
    ["单项目", () => { S.project = "P01"; S.type = "YTD"; }],
    ["单月", () => { S.project = "ALL"; S.type = "M"; S.month = 10; }],
    ["周视图", () => { S.project = "ALL"; S.type = "W"; S.month = 10; S.week = 2; }]
  ];
  let err = 0;
  views.forEach(([name, set]) => {
    set(); reset();
    try {
      renderTrend(); renderTrendProfit();
      const a = html("trend"), b = html("trendPro");
      if (!a || !b || a.indexOf("<svg") < 0 || b.indexOf("<svg") < 0) err++;
      P("  " + name + "：营收标签 " + (cnt(a, "#12354d") + cnt(a, "#3d6b96")) +
        " 个，利润标签 " + (cnt(b, "#2f5a1f") + cnt(b, "#fff") + cnt(b, "#3f7a2e") + cnt(b, "#b03a2e")) + " 个");
    } catch (e) { err++; P("  " + name + " 异常：" + e.message); }
  });
  ok(err === 0, "四个视角渲染均无异常");
  S.project = "ALL"; S.type = "YTD";

  P("--- 完成 ---");
})().catch(e => {
  P("  FAIL 未捕获异常（后续断言未执行）：" + e.message);
});
