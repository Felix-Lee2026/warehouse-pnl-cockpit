const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";

  P("=== 1. 年度 BP 合计 ===");
  const bpY = yearBpTotals(Y);
  let sumR = 0, sumP = 0;
  for (let m = 1; m <= 12; m++) { const b = bpOfMonth(Y + "-" + pad(m)); sumR += b.rev; sumP += b.profit; }
  ok(Math.abs(bpY.rev - sumR) < 0.01 && Math.abs(bpY.profit - sumP) < 0.01,
     "12 个月累加 " + Math.round(bpY.rev).toLocaleString() + " / " + Math.round(bpY.profit).toLocaleString());

  P("=== 2. 区间 BP 按天折算 ===");
  const last = latestDate();
  const r = bpRangeRMB(Y + "-01-01", last);
  const lastM = +last.slice(5, 7), lastD = +last.slice(8, 10);
  const dimM = daysInMonth(Y, lastM);
  // 手算：1..10 月全额 + 11 月 10/30
  let man = 0;
  for (let m = 1; m <= 10; m++) man += bpOfMonth(Y + "-" + pad(m)).rev;
  man += bpOfMonth(Y + "-11").rev * (lastD / dimM);
  ok(Math.abs(r.rev - man) < 0.01, "同期 BP 营收 " + Math.round(r.rev).toLocaleString() + " = 手算 " + Math.round(man).toLocaleString());

  P("=== 3. 关键指标 ===");
  const d = derive(aggregate(Y + "-01-01", last, projSet()).acc);
  const elapsed = (lastM - 1) + lastD / dimM;
  const leftM = 12 - (lastM - 1);
  const revLeft = bpY.rev - d.rev, proLeft = bpY.profit - d.profit;
  const revNeed = revLeft / leftM, proNeed = proLeft / leftM;
  const revPace = d.rev / elapsed, proPace = d.profit / elapsed;
  P("  数据截至 " + last + "，已过 " + elapsed.toFixed(2) + " 个月，剩余 " + leftM + " 个月");
  P("  营收：BP " + Math.round(bpY.rev).toLocaleString() + " / YTD " + Math.round(d.rev).toLocaleString() +
    " / 还差 " + Math.round(revLeft).toLocaleString());
  P("  　　剩余需月均 " + Math.round(revNeed).toLocaleString() + "，当前月均 " + Math.round(revPace).toLocaleString() +
    "，需提速 " + (revNeed / revPace).toFixed(2) + " 倍");
  P("  利润：BP " + Math.round(bpY.profit).toLocaleString() + " / YTD " + Math.round(d.profit).toLocaleString() +
    " / 还差 " + Math.round(proLeft).toLocaleString());
  P("  　　剩余需月均 " + Math.round(proNeed).toLocaleString() + "，当前月均 " + Math.round(proPace).toLocaleString() +
    "，需提速 " + (proNeed / proPace).toFixed(2) + " 倍");

  P("=== 4. 归因恒等式 ===");
  const bpM = r.profit / r.rev, acM = d.profit / d.rev;   // 同期 BP 利润率
  const scaleGap = (r.rev - d.rev) * bpM;
  const effGap = d.rev * (bpM - acM);
  const proGapSame = r.profit - d.profit;
  ok(Math.abs(scaleGap + effGap - proGapSame) < 1,
     "规模差 " + Math.round(scaleGap).toLocaleString() + " + 效率差 " + Math.round(effGap).toLocaleString() +
     " = " + Math.round(scaleGap + effGap).toLocaleString() + "，同期利润差距 " + Math.round(proGapSame).toLocaleString());
  ok(Math.abs(bpM + 0 - r.profit / r.rev) < 1e-12, "同期 BP 利润率 " + (bpM * 100).toFixed(2) + "%（年度 " + (bpY.profit/bpY.rev*100).toFixed(2) + "%）");
  ok(Math.abs(acM + 0 - d.profit / d.rev) < 1e-12, "实际利润率 " + (acM * 100).toFixed(2) + "%");

  P("=== 5. 渲染 ===");
  let h = "";
  try { renderGap(); h = (_lastHTML["gap"] && _lastHTML["gap"].innerHTML) || ""; ok(true, "渲染无异常"); }
  catch (e) { ok(false, "渲染异常：" + e.message); }
  ok(h.indexOf("全年还差") >= 0, "含「全年还差」");
  ok(h.indexOf("剩余 " + leftM + " 个月需月均") >= 0, "含剩余月需月均");
  ok(h.indexOf("需要提速") >= 0, "含需要提速");
  ok(h.indexOf("规模差") >= 0 && h.indexOf("效率差") >= 0, "含差距归因");
  ok(h.indexOf("恒等式拆分") >= 0, "含恒等式说明");
  P("  卡片标题：" + (_lastHTML["gapCap"] && _lastHTML["gapCap"].textContent));
  P("  " + h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 240));

  P("=== 6. 边界 ===");
  S.project = "P01"; renderGap();
  ok((_lastHTML["gap"].innerHTML || "").indexOf("切到「全部项目」") >= 0, "单项目时提示切回全部");
  S.project = "ALL";
  const oy = S.year; S.year = 2020; renderGap();
  ok((_lastHTML["gap"].innerHTML || "").indexOf("还没有实际数据") >= 0, "无数据年份有提示");
  S.year = oy;
  S.type = "W"; S.week = 2; S.month = 11; renderGap();
  ok((_lastHTML["gap"].innerHTML || "").indexOf("全年还差") >= 0, "周视图下仍按年度计算");
  S.type = "YTD";

  P("=== 7. 回归 ===");
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(t => T("renderAll " + t, () => { S.type = t; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("KPI", renderKPI); T("对比", renderCompare); T("租卡", renderRent);
  T("录入台", renderEntry); T("固定项", renderCarry);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
