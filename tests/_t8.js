const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";

  P("=== 1. BP 存的是 RMB，取值不再乘汇率 ===");
  const nov = DB.bp.find(b => b.ym === Y + "-11");
  const raw = {rev: nov.rev, profit: nov.profit};
  const got = bpOfMonth(Y + "-11");
  ok(Math.abs(got.rev - raw.rev) < 0.001, "bpOfMonth 原值返回 " + Math.round(got.rev) + " = 库内 " + Math.round(raw.rev));
  ok(nov.rev > 500000, "11 月 BP 营收 " + Math.round(nov.rev).toLocaleString() + "（RMB 量级，不是 USD 的 7 万级）");

  P("=== 2. BP 不随汇率波动 ===");
  const fxBefore = DB.fx[Y + "-11"];
  _spillCache = {}; mCache = {};
  const bpBefore = bpOfMonth(Y + "-11").rev;
  const dBefore = derive(aggregate(Y + "-11-01", Y + "-11-10", projSet()).acc).rev;

  DB.fx[Y + "-11"] = fxBefore * 1.2;              // 汇率涨 20%
  _spillCache = {}; mCache = {};
  const bpAfter = bpOfMonth(Y + "-11").rev;
  const dAfter = derive(aggregate(Y + "-11-01", Y + "-11-10", projSet()).acc).rev;

  ok(Math.abs(bpAfter - bpBefore) < 0.001, "汇率 +20% → BP 纹丝不动：" + Math.round(bpBefore) + " → " + Math.round(bpAfter));
  ok(Math.abs(dAfter / dBefore - 1.2) < 0.02, "同样汇率 +20% → 实际折 RMB 放大 " +
     ((dAfter / dBefore - 1) * 100).toFixed(1) + "%（" + Math.round(dBefore).toLocaleString() + " → " + Math.round(dAfter).toLocaleString() + "）");
  DB.fx[Y + "-11"] = fxBefore;
  _spillCache = {}; mCache = {};
  ok(Math.abs(derive(aggregate(Y + "-11-01", Y + "-11-10", projSet()).acc).rev - dBefore) < 0.01, "汇率还原后实际数复原");
  P("  → 汇率波动只进实际、不进预算，这正是汇兑影响该被看见的地方");

  P("=== 3. 达成率口径一致 ===");
  const p = period();
  const win = bpWindow(p);
  const d = derive(aggregate(p.from, p.to, projSet()).acc);
  const bp = bpAgg(win);
  const aim = d.rev / bp.rev;
  P("  YTD 实际 " + Math.round(d.rev).toLocaleString() + " / BP " + Math.round(bp.rev).toLocaleString() +
    " = " + (aim * 100).toFixed(1) + "%");
  ok(Math.abs(bp.rev - bpRangeRMB(Y + "-01-01", latestDate()).rev) < 1, "bpAgg 与 bpRangeRMB 一致");
  ok(bp.rev < 20000000, "BP 同期 " + Math.round(bp.rev).toLocaleString() + "（RMB 量级合理）");

  P("=== 4. 年度 BP 合计 ===");
  const yb = yearBpTotals(Y);
  const manRev = DB.bp.reduce((s, b) => s + b.rev, 0);
  const manPro = DB.bp.reduce((s, b) => s + b.profit, 0);
  ok(Math.abs(yb.rev - manRev) < 0.01 && Math.abs(yb.profit - manPro) < 0.01,
     "年度 BP =" + Math.round(yb.rev).toLocaleString() + " / " + Math.round(yb.profit).toLocaleString());

  P("=== 5. 预估增量也是 RMB ===");
  const cm = new Date().getMonth() + 1;
  const adjSum = (DB.adj || []).filter(a => a.ym === Y + "-" + pad(cm)).reduce((s, a) => s + a.rev, 0);
  const adjGot = adjOfMonth(Y + "-" + pad(cm), projSet());
  ok(Math.abs(adjGot - adjSum) < 0.01, "adjOfMonth 原值返回 " + Math.round(adjGot) + " = 库内 " + Math.round(adjSum));
  ok(adjSum > 80000, "增量合计 " + Math.round(adjSum).toLocaleString() + "（RMB 量级）");

  P("=== 6. 迁移：旧 USD BP → RMB ===");
  // 造一份「旧格式」：BP 存 USD，meta 无 bpRMB 标记
  const usdPack = JSON.parse(JSON.stringify(packDB(DB)));
  usdPack.meta = Object.assign({}, usdPack.meta);
  delete usdPack.meta.bpRMB;
  usdPack.bp = usdPack.bp.map(b => {
    const r = DB.fx[b.ym] != null ? DB.fx[b.ym] : (DB.fx["default"] || 7.1);
    return Object.assign({}, b, {rev: +(b.rev / r).toFixed(2), profit: +(b.profit / r).toFixed(2)});
  });
  const rmbTarget = DB.bp.reduce((s, b) => s + b.rev, 0);

  DB = null;
  global.__LS = JSON.stringify(usdPack);
  await init();
  const afterMig = DB.bp.reduce((s, b) => s + b.rev, 0);
  ok(Math.abs(afterMig - rmbTarget) < 30, "迁移后年度合计 " + Math.round(afterMig).toLocaleString() +
     " ≈ 迁移前 " + Math.round(rmbTarget).toLocaleString() + "（差额来自逐月四舍五入）");
  const nov2 = DB.bp.find(b => b.ym === Y + "-11");
  ok(Math.abs(nov2.rev - raw.rev) < 1, "11 月还原：" + Math.round(nov2.rev) + " vs " + Math.round(raw.rev));
  ok(DB.meta.bpRMB === 1, "已打迁移标记");

  P("=== 7. 迁移幂等（再打开一次不会二次放大）===");
  const pack2 = packDB(DB);
  DB = null;
  global.__LS = JSON.stringify(pack2);
  await init();
  const after2 = DB.bp.reduce((s, b) => s + b.rev, 0);
  ok(Math.abs(after2 - afterMig) < 1, "二次打开 " + Math.round(after2).toLocaleString() + " = " + Math.round(afterMig).toLocaleString());

  P("=== 8. 缺口分析仍自洽 ===");
  global.__LS = null;
  DB = null;
  await init();
  S.year = new Date().getFullYear(); S.project = "ALL"; S.type = "YTD";
  renderGap();
  const h = (_lastHTML["gap"] && _lastHTML["gap"].innerHTML) || "";
  ok(h.indexOf("全年还差") >= 0 && h.indexOf("规模差") >= 0, "缺口卡片正常");
  const bpY2 = yearBpTotals(S.year);
  const d2 = derive(aggregate(S.year + "-01-01", latestDate(), projSet()).acc);
  P("  年度 BP " + Math.round(bpY2.rev).toLocaleString() + " / YTD " + Math.round(d2.rev).toLocaleString() +
    " / 达成 " + (d2.rev / bpY2.rev * 100).toFixed(1) + "%");

  P("=== 9. 录入表显示 RMB ===");
  renderPanel();
  renderBpTable();
  const t = (_lastHTML["tblBp"] && _lastHTML["tblBp"].innerHTML) || "";
  ok(t.indexOf("RMB") >= 0, "表头标注 RMB");
  ok((_lastHTML["bpSumTip"].textContent || "").indexOf("RMB") >= 0, "合计提示：" + _lastHTML["bpSumTip"].textContent);
  const novInput = (t.match(/data-m='11' data-f='rev' value='(\d+)'/) || [])[1];
  ok(novInput && +novInput > 500000, "11 月输入框预填 " + novInput + "（RMB 原值，不是 USD）");

  P("=== 10. 回归 ===");
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(ty => T("renderAll " + ty, () => { S.type = ty; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("对比", renderCompare); T("人效", renderUnit); T("录入台", renderEntry);
  T("BP利润", renderBpTable);
  T("BP增量", renderBpTable);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
