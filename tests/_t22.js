const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";

  P("=== 1. 预估增量已从 BP 页移出 ===");
  renderBpTable();
  const bp = _lastHTML["tblBp"].innerHTML;
  ok(bp.indexOf("data-f='adj'") < 0, "BP 表里已无增量输入框");
  ok(bp.indexOf("data-f='rev'") >= 0 && bp.indexOf("data-f='profit'") >= 0, "BP 表仍有营收 / 利润两行");
  ok(bp.indexOf("利润率") >= 0, "BP 表仍有利润率行");
  ok(bp.indexOf("当月预估增量") < 0, "BP 表首列不再出现「当月预估增量」");

  P("=== 2. 时间进度树页承载增量表 ===");
  renderAdjTable();
  const adj = _lastHTML["tblAdj"].innerHTML;
  const nInput = (adj.match(/data-f='adj/g) || []).length;
  const nRev = (adj.match(/data-f='adjrev'/g) || []).length;
  const nPro = (adj.match(/data-f='adjprofit'/g) || []).length;
  ok(nInput === DB.projects.length * 24 && nRev === DB.projects.length * 12 && nPro === nRev,
     "每个项目两行：营收 " + nRev + " + 利润 " + nPro + " = " + nInput + " 个输入框");
  const ys = adj.match(/data-y='(\d{4})'/g) || [];
  ok(ys.length === nInput && ys.every(s => s.indexOf(String(Y)) >= 0),
     "每个输入框都带年份 " + Y + "（共 " + ys.length + " 个）");
  ok(adj.indexOf(">营收<") >= 0 && adj.indexOf(">利润<") >= 0, "每个项目都有营收 / 利润两行标签");
  ok(DB.projects.every(p => adj.indexOf(p.id) >= 0), "所有项目都在表内");

  P("=== 3. 写入落在输入框自带的年份上（不依赖 bpYear 下拉）===");
  const bkAdj = JSON.parse(JSON.stringify(DB.adj || []));
  document.getElementById("bpYear").value = "";          /* 模拟不在 BP 页，下拉为空 */
  setBp("P01", 3, "adj", 12345, Y);
  let rec = (DB.adj || []).find(a => a.p === "P01" && a.ym === Y + "-03");
  ok(rec && Math.abs(rec.rev - 12345) < 0.01, "写进 " + Y + "-03：" + (rec ? rec.rev : "无记录"));

  document.getElementById("bpYear").value = String(Y - 1);  /* 下拉停在别的年份也不该影响 */
  setBp("P01", 3, "adj", 777, Y);
  rec = (DB.adj || []).find(a => a.p === "P01" && a.ym === Y + "-03");
  ok(rec && Math.abs(rec.rev - 777) < 0.01, "data-y 优先于 bpYear 下拉：" + (rec ? rec.rev : "无记录"));
  document.getElementById("bpYear").value = "";

  P("=== 4. 换年只显示对应年份 ===");
  setBp("P02", 5, "adj", 4321, Y - 1);
  S.year = Y - 1;
  renderAdjTable();
  const adjPrev = _lastHTML["tblAdj"].innerHTML;
  ok(adjPrev.indexOf("data-y='" + (Y - 1) + "'") >= 0, "上年表的输入框年份是 " + (Y - 1));
  ok(adjPrev.indexOf("data-y='" + Y + "'") < 0, "上年表里没有今年的输入框");
  ok(adjPrev.indexOf("value='4321'") >= 0, "去年 5 月 4321 已回填");
  ok(adjPrev.indexOf("value='777'") < 0, "今年的 777 不会串到上年");

  S.year = Y;
  renderAdjTable();
  const adjCur = _lastHTML["tblAdj"].innerHTML;
  ok(adjCur.indexOf("value='777'") >= 0, "回到今年仍显示 777");
  ok(adjCur.indexOf("value='4321'") < 0, "去年的 4321 不串到今年");

  P("=== 5. 年度合计与库内一致 ===");
  const manSum = DB.adj.filter(a => a.ym.slice(0, 4) === String(Y)).reduce((s, a) => s + a.rev, 0);
  ok(Math.abs(adjYearSum(Y) - manSum) < 0.01,
     "adjYearSum(" + Y + ") = " + Math.round(adjYearSum(Y)) + " = 库内 " + Math.round(manSum));
  ok(_lastHTML["adjSumTip"].textContent.indexOf(fmtMoney(manSum)) >= 0,
     "右上角合计显示 " + fmtMoney(manSum));

  P("=== 6. 数据源与预测口径未被影响 ===");
  _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {};
  const cm = new Date().getMonth() + 1;
  const adjNow = DB.adj.filter(a => a.ym === Y + "-" + pad(cm)).reduce((s, a) => s + a.rev, 0);
  ok(Math.abs(adjOfMonth(Y + "-" + pad(cm), projSet()) - adjNow) < 0.01,
     "adjOfMonth 仍按项目过滤：" + Math.round(adjNow));
  const f = forecastMonth(Y + "-" + pad(cm), projSet());
  const a = monthAgg(Y + "-" + pad(cm), projSet());
  const k = a.dim ? a.dim / (a.days || a.dim) : 1;   /* days/dim 在 monthAgg 顶层，不在 d 里 */
  ok(Math.abs(f.rev - (a.d.rev * k + adjOfMonth(Y + "-" + pad(cm), projSet()))) < 1,
     "当月预测 = 实际 " + Math.round(a.d.rev) + " × " + k.toFixed(2) + " + 增量 = " + Math.round(f.rev));
  ok(a.days > 0 && a.days <= a.dim, "已录 " + a.days + "/" + a.dim + " 天");

  /* 复原 */
  DB.adj = bkAdj;
  P("--- 完成 ---");
})();
