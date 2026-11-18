const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; };
  const saveRent = () => JSON.parse(JSON.stringify(DB.rent));
  const saveDef = () => DB.meta.rentDefault;

  P("=== 1. 取值优先级 ===");
  DB.rent = { [Y + "-03"]: 30000 };
  DB.meta.rentDefault = 45000;
  ok(rentOf(Y + "-03") === 30000, "3 月取逐月值 " + rentOf(Y + "-03"));
  ok(rentOf(Y + "-04") === 45000, "4 月未填 → 回退默认月租 " + rentOf(Y + "-04"));
  DB.meta.rentDefault = null;
  delete DB.meta.rentDefault;
  DB.meta.rentTotal = 50000;
  ok(rentOf(Y + "-07") === 50000, "无默认值 → 回退旧版 rentTotal " + rentOf(Y + "-07"));
  DB.rent = {}; DB.meta.rentDefault = 45000;

  P("=== 2. 逐月不同租金按天折算 ===");
  DB.rent = {};
  for (let m = 1; m <= 12; m++) DB.rent[Y + "-" + pad(m)] = 10000 * m;   // 逐月递增
  reset();
  const sp1 = computeRentSpill(Y + "-01-01", Y + "-03-31");
  const m1 = 10000 * (DB.fx[Y + "-01"] || 7.1);
  const m2 = 20000 * (DB.fx[Y + "-02"] || 7.1);
  const m3 = 30000 * (DB.fx[Y + "-03"] || 7.1);
  const expect = m1 + m2 + m3;
  ok(Math.abs(sp1.total - expect) < 100,
     "1-3 月合计 " + Math.round(sp1.total).toLocaleString() + " = 手算 " + Math.round(expect).toLocaleString());
  ok(Math.abs(sp1.total - (m1 + m2 + m3)) < 1, "逐月求和精确（差值 " + (sp1.total - expect).toFixed(2) + "）");

  P("=== 3. 单月查询只取该月 ===");
  reset();
  const sp2 = computeRentSpill(Y + "-02-01", Y + "-02-28");
  ok(Math.abs(sp2.total - m2) < 1, "2 月单月 " + Math.round(sp2.total).toLocaleString() + " = 20000 × 汇率");
  ok(sp2.months.length === 1 && sp2.months[0] === Y + "-02", "只含 2 月：" + sp2.months.join(","));

  P("=== 4. 部分月份（按天折算）===");
  reset();
  const sp3 = computeRentSpill(Y + "-03-01", Y + "-03-15");
  const dim3 = daysInMonth(Y, 3);
  ok(Math.abs(sp3.total - m3 * (15 / dim3)) < 1,
     "3 月前 15 天 " + Math.round(sp3.total).toLocaleString() + " = 全月 × 15/" + dim3);

  P("=== 5. 关键：租金为 0 的月份不产生负溢出 ===");
  const kept = saveRent(), keptDef = saveDef();
  DB.rent = {};
  DB.rent[Y + "-05"] = 0;                 // 明确填 0（免租期）
  DB.meta.rentDefault = 0;
  DB.facts.push({d: Y + "-05-10", p: "P01", a: "C01.01", v: 50000, src: "edit"});
  reset();
  const sp4 = computeRentSpill(Y + "-05-01", Y + "-05-31");
  ok(sp4.total === 0, "5 月租金 0 → 应摊 0");
  ok(sp4.spill === 0, "5 月溢出 0（不因项目录了场地费而变成负数冲减）");
  ok(sp4.months.length === 0, "5 月不参与折算");

  P("=== 6. 混合：部分月有租、部分月为 0 ===");
  DB.rent = { [Y + "-04"]: 40000, [Y + "-05"]: 0, [Y + "-06"]: 60000 };
  DB.meta.rentDefault = 0;
  reset();
  const sp5 = computeRentSpill(Y + "-01-01", Y + "-06-30");
  ok(sp5.months.length === 2, "只有 4 月和 6 月参与：" + sp5.months.join(","));
  const e5 = 40000 * (DB.fx[Y + "-04"] || 7.1) + 60000 * (DB.fx[Y + "-06"] || 7.1);
  ok(Math.abs(sp5.total - e5) < 100, "应摊 " + Math.round(sp5.total).toLocaleString() + " = 手算 " + Math.round(e5).toLocaleString());

  P("=== 7. 打包/恢复要带上逐月仓租 ===");
  DB.rent = kept; DB.meta.rentDefault = keptDef;
  const packed = packDB(DB);
  ok(packed.v === 4, "包版本 v4");
  ok(packed.rent && Object.keys(packed.rent).length > 0, "包含 rent：" + Object.keys(packed.rent).length + " 个月");
  const back = unpackDB(JSON.parse(JSON.stringify(packed)));
  ok(JSON.stringify(back.rent) === JSON.stringify(DB.rent), "往返一致");
  const oldPack = { v: 3, accounts: DB.accounts, projects: DB.projects, fx: DB.fx, meta: {rentTotal: 12345}, bp: [], facts: [] };
  const oldBack = unpackDB(JSON.parse(JSON.stringify(oldPack)));
  ok(oldBack.rent && Object.keys(oldBack.rent).length === 0, "旧包补空对象");
  ok(rentOf.call(null, Y + "-01") !== undefined, "旧包仍可取值（回退 rentTotal）");

  P("=== 8. 表格渲染 ===");
  DB.rent = {};
  DB.rent[Y + "-01"] = 38000;
  DB.rent[Y + "-09"] = 52000;
  DB.meta.rentDefault = 45000;
  renderRentTable();
  const h = (_lastHTML["tblRent"] && _lastHTML["tblRent"].innerHTML) || "";
  ok((h.match(/data-rent=/g) || []).length === 12, "12 个输入框");
  ok(h.indexOf("value='38000'") >= 0, "1 月预填 38000");
  ok(h.indexOf("value='52000'") >= 0, "9 月预填 52000");
  ok((h.match(/value=''/g) || []).length === 10, "其余 10 个月 value 为空（走默认值）");
  ok((h.match(/placeholder='45000'/g) || []).length === 12, "12 个输入框都带默认值提示");
  ok(h.indexOf(Y + "-12") >= 0, "含 12 月行");

  P("=== 9. 单位跟随录入口径 ===");
  DB.meta.entryCcy = "RMB";
  renderRentTable();
  ok((_lastHTML["rentUnit"].textContent) === "RMB", "单位显示 RMB");
  DB.meta.entryCcy = "USD";

  P("=== 10. 预览显示全年合计 ===");
  renderRentPreview();
  const pv = (_lastHTML["rentPreview"] && _lastHTML["rentPreview"].innerHTML) || "";
  const ySum = 38000 + 52000 + 45000 * 10;
  ok(pv.indexOf(fmtNum(ySum)) >= 0, "全年合计 " + fmtNum(ySum));
  ok(pv.indexOf("月均") >= 0, "含月均 " + fmtNum(ySum / 12));
  ok(pv.indexOf("参与折算的月份") >= 0, "含参与月份说明");

  P("=== 11. 溢出卡片提示 ===");
  DB.rent = {}; DB.meta.rentDefault = 0;
  reset(); renderRent();
  const rb = (_lastHTML["rentbar"] && _lastHTML["rentbar"].innerHTML) || "";
  ok(rb.indexOf("本期没有任何月份填了仓租") >= 0, "无租金时提示");

  P("=== 11b. 未完月份：租金按整月计入，不按数据天数截断 ===");
  DB.rent = {}; DB.meta.rentDefault = 0;
  DB.rent[Y + "-11"] = 30000;
  const fx11 = DB.fx[Y + "-11"] || 7.1;
  reset();
  const spanNov = monthSpan(Y + "-11", projSet());
  const dNov = spanNov.days, dimNov = spanNov.dim;
  const spNov = computeRentSpill(spanNov.from, spanNov.to);
  ok(spNov.months.length === 1, "11 月参与折算");
  ok(Math.abs(spNov.total - 30000 * fx11 * (dNov / dimNov)) < 1,
     "应摊 = 月租 × " + dNov + "/" + dimNov + " = " + Math.round(spNov.total).toLocaleString() + "（按已录天数）");
  ok(spanNov.from === Y + "-11-01" && spanNov.to === Y + "-11-" + pad(dNov),
     "聚合区间截到有数据最后一天：" + spanNov.from + " ~ " + spanNov.to);
  ok(dNov > 0 && dNov <= dimNov, "已录 " + dNov + "/" + dimNov + " 天");

  /* 关键自洽：实际（含 9 天房租）× k = 整月房租 */
  const kNov = dimNov / dNov;
  ok(Math.abs(spNov.total * kNov - 30000 * fx11) < 1,
     "房贷年化自洽：" + Math.round(spNov.total).toLocaleString() + " × " + kNov.toFixed(2) +
     " = " + Math.round(spNov.total * kNov).toLocaleString() + "（整月租金）");

  P("=== 11c. 当月预测 = 实际 ÷ 已过天数 × 自然天数 ===");
  const R_nov = () => computeRentSpill(Y + "-11-01", Y + "-11-30").total;
  DB.adj = [];        // 清掉预估增量，隔离「增量 × 利润率」这一项对结果的连带影响
  reset(); mCache = {};
  const f1 = forecastMonth(Y + "-11", projSet());
  const a1 = monthActual(Y + "-11", projSet());
  DB.rent[Y + "-11"] = 40000;            // 租金 +1 万
  reset(); mCache = {};
  const f2 = forecastMonth(Y + "-11", projSet());
  const a2 = monthActual(Y + "-11", projSet());
  const rat11 = dNov / dimNov;
  ok(Math.abs((a1.profit - a2.profit) - 10000 * fx11 * rat11) < 2,
     "实际利润减少 " + Math.round(a1.profit - a2.profit).toLocaleString() +
     " = 租金增量 × " + dNov + "/" + dimNov);
  const k11 = a1.dim / a1.days;
  /* 最简式：预测 = 实际 ÷ 已过天数 × 自然天数，租金随之一并年化 */
  /* 关键：按天摊的租金年化后正好还原成整月租金，所以预测只减少一个整月增量 */
  ok(Math.abs((f1.profit - f2.profit) - 10000 * fx11) < 3,
     "预测利润减少 " + Math.round(f1.profit - f2.profit).toLocaleString() +
     " = 整月租金增量 " + Math.round(10000 * fx11).toLocaleString() +
     "（按天摊 " + Math.round(rat11 * 100) + "% 后再 × k" + k11.toFixed(2) + "，正好还原）");
  ok(Math.abs(f1.profit - (a1.profit * k11 + adjOfMonth(Y + "-11", projSet()) * (a1.rev ? a1.profit / a1.rev : 0))) < 3,
     "预测值 = 实际 × k + 增量 × 利润率（" + Math.round(f1.profit).toLocaleString() + "）");
  P("  11 月录到第 " + a1.days + " 天，k = " + k11.toFixed(2) +
    "；当月租金 " + Math.round(R_nov()).toLocaleString() +
    " 在预测中被放大为 " + Math.round(R_nov() * k11).toLocaleString());

  P("=== 12. 回归 ===");
  DB.rent = kept; DB.meta.rentDefault = keptDef;
  reset();
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(ty => T("renderAll " + ty, () => { S.type = ty; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("拆解", renderRecon); T("核对台", renderCheck); T("缺口", renderGap);
  T("人效", renderUnit); T("录入台", renderEntry); T("租卡", renderRent); T("固定项", renderCarry);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
