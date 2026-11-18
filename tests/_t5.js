const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";

  P("=== 1. 业务量口径 ===");
  const p = period();
  const agg = periodAgg(p, projSet());
  const d = agg.d, qty = agg.qty;
  const order = qty["Q03"] || 0, boxc = qty["Q01"] || 0;
  const cbm = latestQtySum(p.from, p.to, "Q02", projSet());
  // 手算 Q03 累加
  let manOrder = 0, manBox = 0;
  DB.facts.forEach(f => {
    if (f.d < p.from || f.d > p.to) return;
    if (f.a === "Q03") manOrder += f.v;
    if (f.a === "Q01") manBox += f.v;
  });
  ok(Math.abs(order - manOrder) < 0.01, "出库单量累加 " + order + " = 手算 " + manOrder);
  ok(Math.abs(boxc - manBox) < 0.01, "入库柜量累加 " + boxc + " = 手算 " + manBox);
  ok(cbm !== null && isFinite(cbm), "库存立方取时点值 " + cbm);

  // 仓级期末库存 = 各项目各自期末值之和，而不是「全仓最后一条记录」
  let manCbm = 0, projCnt = 0;
  DB.projects.forEach(pr => {
    const v = latestQty(p.from, p.to, "Q02", [pr.id]);
    if (v !== null && isFinite(v)) { manCbm += v; projCnt++; }
  });
  ok(Math.abs(cbm - manCbm) < 0.01, "期末库存 = 各项目期末值之和 " + cbm + " = 手算 " + manCbm + "（" + projCnt + " 个项目）");
  const singleRec = latestQty(p.from, p.to, "Q02", projSet());
  ok(cbm > singleRec, "仓级 " + cbm + " > 单条记录 " + singleRec + "：不再只取最后一日的那一条");

  P("=== 2. 期间折算月数 ===");
  const months = periodMonths(p.from, p.to);
  P("  " + p.from + " ~ " + p.to + " = " + months.toFixed(4) + " 个月");
  ok(months > 10 && months < 11, "YTD 至 11-10 约 10.33 个月：" + months.toFixed(2));

  P("=== 3. 只保留趋势图（三格单均/库存周转已按用户要求移除） ===");
  renderUnit();
  let h = (_lastHTML["unit"] && _lastHTML["unit"].innerHTML) || "";
  ok(h.indexOf("<svg") >= 0, "趋势图仍在");
  ok((h.match(/class="unitbox"/g) || []).length === 0, "指标格数为 0");
  ["单均利润", "单均成本", "库存周转", "单均收入", "每柜成本"].forEach(k => {
    ok(h.indexOf(k) < 0, "不再出现「" + k + "」");
  });
  ok(h.indexOf("次/月") < 0, "不再出现「次/月」量纲");
  // 图上仍要有三条线 + 图例
  ["出库单量", "人力成本"].forEach(k => {
    ok(h.indexOf(k) >= 0, "图例含「" + k + "」");
  });
  ok(h.indexOf("每单人力成本") < 0, "「每单人力成本」已隐藏（等口径换成件后再开）");

  P("=== 4. 未填人数 ===");
  DB.meta.headcount = 0;
  renderUnit();
  h = (_lastHTML["unit"] && _lastHTML["unit"].innerHTML) || "";
  ok(h.indexOf("还没填在编人数") >= 0, "提示去填人数");

  P("=== 5. 填入人数 ===");
  DB.meta.headcount = 300;
  renderUnit();
  h = (_lastHTML["unit"] && _lastHTML["unit"].innerHTML) || "";
  const perHeadOrder = order / 300 / months, perHeadRev = d.rev / 300 / months;
  P("  人均月出库 " + Math.round(perHeadOrder) + " 单　人均月产值 " + fmtMoney(perHeadRev));
  ok(h.indexOf("在编 <b>300</b> 人") >= 0, "显示在编人数");
  ok(h.indexOf(Math.round(perHeadOrder).toLocaleString("zh-CN")) >= 0, "人均月出库入表");
  ok(h.indexOf(fmtMoney2(perHeadRev)) >= 0, "人均月产值入表");

  P("=== 6. 各期间 ===");
  ["MTD","M","W"].forEach(t => {
    S.type = t; if (t === "W") { S.week = 2; S.month = 11; }
    let e = null;
    try { renderUnit(); e = (_lastHTML["unit"] && _lastHTML["unit"].innerHTML) || ""; } catch (err) { e = "ERR " + err.message; }
    const m = periodMonths(period().from, period().to);
    P("  " + t + "：" + period().label + "　折算 " + m.toFixed(3) + " 月　" + (e.indexOf("unitbox") >= 0 ? "正常" : "空/异常"));
    ok(e.indexOf("<svg") >= 0 || e.indexOf("还没有业务量数据") >= 0, t + " 渲染正常");
  });
  S.type = "YTD";

  P("=== 7. 单项目视角 ===");
  S.project = "P01";
  renderUnit();
  const h7 = (_lastHTML["unit"] && _lastHTML["unit"].innerHTML) || "";
  ok(h7.indexOf("<svg") >= 0 || h7.indexOf("还没有业务量数据") >= 0, "单项目视角也出图");
  ok((h7.match(/class="unitbox"/g) || []).length === 0, "单项目视角同样不显示指标格");
  S.project = "ALL";

  P("=== 8. 回归 ===");
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(t => T("renderAll " + t, () => { S.type = t; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("缺口", renderGap); T("录入台", renderEntry); T("固定项", renderCarry);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
