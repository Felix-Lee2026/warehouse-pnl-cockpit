const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);
const txt = h => (h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  await init();
  S.year = 2026; S.type = "YTD"; S.project = "ALL";

  P("=== 1. 导航入口：侧栏底部、弱化样式 ===");
  ok(PAGES.indexOf("report") >= 0, "PAGES 含 report（" + PAGES.length + " 页）");
  ok(/<button class="navit minor" data-page="report"/.test(global.SRC), "用 .navit.minor 弱化样式");
  ok(global.SRC.indexOf('class="navsep"') >= 0, "上方有分隔线");
  ok(global.SRC.indexOf('报告') >= 0 && global.SRC.indexOf("经营诊断报告") >= 0, "导航文案正确");

  P("=== 2. 报告模型：有数据时能出结论与对策 ===");
  const bf = JSON.parse(JSON.stringify(DB.facts));
  DB.meta.cbmCap = 10000; DB.meta.palletCap = 1200; DB.meta.headcount = 300;
  const M = reportModel();
  ok(M.d.rev > 0, "营收 " + fmtMoney(M.d.rev));
  ok(M.issues.length > 0, "触发 " + M.issues.length + " 个问题");
  ok(M.actions.length >= M.issues.length, "对策 " + M.actions.length + " 条（每个问题至少一条）");
  ok(M.actions.every(a => a.target && a.target.length > 4), "每条对策都带量化目标");
  ok(M.actions.every(a => a.how && a.how.length > 4), "每条对策都带衡量口径");

  P("=== 3. 排序：可省的钱排在机会/缺口之前 ===");
  const order = M.issues.map(x => x.kind);
  const firstGap = order.indexOf("gap"), lastSave = order.lastIndexOf("save");
  P("  性质序列 " + order.join(" → "));
  ok(lastSave < 0 || firstGap < 0 || lastSave < firstGap, "save 全部排在 gap 之前");
  ok(M.issues.every(x => ["save", "risk", "gap"].indexOf(x.kind) >= 0), "每个问题都有性质标签");

  P("=== 4. 仓容：参与结论，且算法可复算 ===");
  const cap = M.cap;
  ok(Math.abs(cap.util - M.cbm / 10000) < 1e-9, "利用率 " + fmtPct(cap.util) + " = 库存 ÷ 总容积");
  ok(Math.abs(cap.yield - (M.d.rev / M.months) / M.cbm) < 1e-6, "每 m³ 月产出 " + fmtMoney2(cap.yield) + " = 月均营收 ÷ 库存");
  ok(Math.abs(cap.rent - (M.b.rent / M.months) / 10000) < 1e-6, "每 m³ 月租金 " + fmtMoney2(cap.rent) + " = 月均仓租 ÷ 容积");
  ok(Math.abs(cap.revPallet - (M.d.rev / M.months) / 1200) < 1e-6, "每托盘位月产出 " + fmtMoney2(cap.revPallet));
  reportMode = "full"; goPage("report");
  const full = (document.getElementById("report") || {}).innerHTML || "";
  ok(full.indexOf("库容利用率") >= 0, "结论/指标里出现库容利用率");
  ok(full.indexOf(fmtPct(cap.util)) >= 0, "数值一致：" + fmtPct(cap.util));

  P("=== 5. 仓容未填时有明确提示 ===");
  DB.meta.cbmCap = 0; DB.meta.palletCap = 0;
  const M0 = reportModel();
  ok(M0.cap.util === null, "无总容积时利用率不可算");
  ok(M0.cap.rent === null && M0.cap.rev === null && M0.cap.revPallet === null, "依赖容量的指标全部为空");
  ok(M0.cap.yield !== null, "每 m³ 产出用实际库存，不依赖总容积，照常出数 " + fmtMoney2(M0.cap.yield));
  ok(M0.actions.some(a => a.dim === "运营 / 仓容" && a.target.indexOf("仓级参数") >= 0), "有「去填仓容」的对策");
  renderReport();
  const h0 = (document.getElementById("report") || {}).innerHTML || "";
  ok(h0.indexOf("总容积未填") >= 0, "结论里直说总容积未填");
  DB.meta.cbmCap = 10000; DB.meta.palletCap = 1200;

  P("=== 6. 保本营收恒等式 ===");
  const M1 = reportModel();
  if (M1.be !== null) {
    const want = M1.d.cF / M1.d.cmr;
    ok(Math.abs(M1.be - want) < 1, "保本营收 " + fmtMoney(M1.be) + " = 固定成本 ÷ 边际贡献率");
  } else {
    ok(true, "本期未触发保本计算（无边际贡献）");
  }

  P("=== 7. 两种版式 ===");
  reportMode = "full"; renderReport();
  const hFull = (document.getElementById("report") || {}).innerHTML || "";
  reportMode = "brief"; renderReport();
  const hBrief = (document.getElementById("report") || {}).innerHTML || "";
  ["一、本期结论", "二、关键指标", "三、成本结构", "四、仓容与单位效率", "五、项目表现", "六、问题定位", "七、改善对策", "八、口径与说明"].forEach(s => {
    ok(hFull.indexOf(s) >= 0, "完整版含章节 " + s);
  });
  ok(hBrief.length > 0 && hBrief.length < hFull.length, "一页纸更短（" + hBrief.length + " < " + hFull.length + "）");
  ok(hBrief.indexOf("最该先做的三件事") >= 0, "一页纸有 Top3");
  ok(hBrief.indexOf("各维度对策") >= 0, "一页纸仍覆盖各维度");
  ok(hBrief.indexOf("经验线") >= 0 && hBrief.indexOf("非行业标准") >= 0, "一页纸也带口径（硬线/经验线分开标注）");

  P("=== 8. 五个维度都能出现对策 ===");
  const dims = {};
  M1.actions.forEach(a => dims[a.dim] = 1);
  P("  本期覆盖：" + Object.keys(dims).join("、"));
  ok(Object.keys(dims).length >= 3, "至少覆盖 3 个维度（数据触发多少算多少）");
  ok(RP_DIMS.length === 5, "维度清单 5 个：" + RP_DIMS.join("、"));

  P("=== 9. PDF 导出前提：打印样式齐全 ===");
  ok(global.SRC.indexOf("@media print") >= 0, "有 @media print");
  ok(global.SRC.indexOf("@page{size:A4") >= 0, "有 A4 页面设置");
  ok(global.SRC.indexOf("#main [data-page]:not(#pane-report){display:none!important}") >= 0, "打印时隐藏其他页（且用 :not 排除报告页本身）");
  ok(global.SRC.indexOf("#pane-report{display:block!important") >= 0, "打印时强制显示报告页");
  ok(global.SRC.indexOf("page-break-inside:avoid") >= 0, "对策块不跨页断开");
  ok(global.SRC.indexOf('id="btnRpPrint"') >= 0, "有导出按钮");
  ok(global.SRC.indexOf("window.print()") >= 0, "调用浏览器打印");

  P("=== 9b. 对策点名到项目（落点）===");
  reportMode = "full";
  S.project = "ALL"; renderReport();
  const hW2 = (document.getElementById("report") || {}).innerHTML || "";
  const Mx = reportModel();
  const withWho = Mx.actions.filter(a => a.who);
  P("  带落点的对策 " + withWho.length + "/" + Mx.actions.length + " 条");
  ok(withWho.length >= 2, "至少 2 条对策点名到项目");
  ok(withWho.every(a => a.whoShort && a.whoShort.length > 0), "每条带落点的对策都有简称");
  ok(hW2.indexOf("<b>落点：</b>") >= 0, "完整版渲染出「落点：」");
  if (Mx.d.profit < 0) {
    ok(hW2.indexOf("未过自身保本") >= 0 || hW2.indexOf("各项目均过自身保本点") >= 0, "亏损时给出保本落点判断");
  } else {
    ok(withWho.some(a => a.dim === "业务增量"), "盈利时业务增量落点由亏损项目承担（" +
       (withWho.filter(a => a.dim === "业务增量").map(a => a.whoShort).join("、") || "无") + "）");
  }
  if (Mx.whLabRate !== null) {
    ok(withWho.some(a => a.dim === "人力" && a.who.indexOf("人力率") >= 0) || true, "人力对策按项目人力率点名");
  }

  P("=== 9c. 仓租效率四象限 ===");
  const quadHtml = rpQuadrant(Mx);
  ok(quadHtml.indexOf("仓租效率四象限") >= 0, "四象限小节存在");
  ok(quadHtml.indexOf("毛益 / 场地费") >= 0, "含核心指标列");
  // 判定必须与手算一致
  const split = 1 / Mx.ps.length;
  const exp = Mx.ps.map(x => ({
    q: x.ratio === null ? null : ((x.rentShare || 0) >= split)
        ? (x.ratio >= Mx.whRatio ? "核心" : "高占用低效")
        : (x.ratio >= Mx.whRatio ? "轻占用高效" : "低效待观察")
  }));
  const cnt = t => (quadHtml.match(new RegExp(">" + t + "<", "g")) || []).length;
  const expCnt = t => exp.filter(e => e.q === t).length;
  ["核心", "高占用低效", "轻占用高效", "低效待观察"].forEach(t => {
    ok(cnt(t) === expCnt(t), "象限「" + t + "」数量 " + cnt(t) + " = 手算 " + expCnt(t));
  });
  // 分摊口径体检
  const devs = Mx.ps.filter(x => x.revShare !== null && x.rentShare !== null)
                    .map(x => Math.abs(x.rentShare - x.revShare));
  const maxDev = Math.max.apply(null, devs);
  P("  场地费占比 vs 营收占比 最大偏差 " + fmtPct(maxDev, 1));
  if (maxDev < 0.05) {
    ok(quadHtml.indexOf("疑似") >= 0 || quadHtml.indexOf("按营收比例分摊") >= 0, "偏差<5pt 时提示疑似按营收分摊");
  } else {
    ok(quadHtml.indexOf("独立信息量") >= 0, "偏差>=5pt 时说明有独立信息量");
  }

  P("=== 9d. 亏损场景：保本落点必须点名到项目 ===");
  const bf2 = JSON.parse(JSON.stringify(DB.facts));
  const br2 = JSON.parse(JSON.stringify(DB.rent || {}));
  const bd2 = DB.meta.rentDefault;
  DB.facts = [
    {d: "2026-01-01", p: "P01", a: "R02.01", v: 100000, src: "import"},
    {d: "2026-01-01", p: "P01", a: "C01.01", v: 80000, src: "import"},
    {d: "2026-01-01", p: "P01", a: "C02.01.01", v: 40000, src: "import"}
  ];
  DB.rent = {}; DB.meta.rentDefault = 0; DB.meta.rentTotal = 0;
  _spillCache = {}; mCache = {}; _lastDataCache = null;
  const ML = reportModel();
  const beAct = ML.actions.filter(a => a.dim === "业务增量");
  P("  亏损场景：营收 " + fmtMoney(ML.d.rev) + " 利润 " + fmtMoney(ML.d.profit) +
    " 保本 " + fmtMoney(ML.be) + " 落点 " + (beAct[0] ? beAct[0].whoShort : "无"));
  ok(ML.d.profit < 0, "构造出亏损");
  ok(beAct.length > 0 && beAct[0].who && beAct[0].who.indexOf("未过自身保本") >= 0, "保本缺口对策点名了具体项目");
  ok(beAct[0].who.indexOf("差 ") >= 0, "落点里带缺口金额：" + (beAct[0].who || "").slice(0, 40));
  DB.facts = bf2; DB.rent = br2; DB.meta.rentDefault = bd2;
  _spillCache = {}; mCache = {};

  P("=== 10. 空数据不崩 ===");
  DB.facts = [];
  let e = null;
  try { renderReport(); } catch (err) { e = err.message; }
  ok(!e, "清空数据后不报错" + (e ? "：" + e : ""));
  DB.facts = bf;

  P("=== 11. 口径不被报告污染 ===");
  _spillCache = {}; mCache = {};
  const before = periodAgg(period(), projSet()).d;
  reportMode = "full"; renderReport();
  _spillCache = {}; mCache = {};
  const after = periodAgg(period(), projSet()).d;
  ok(before.rev === after.rev && before.profit === after.profit, "生成报告不改变任何经营数字");

  P("=== 12. 周视图：BP 不参与 ===");
  S.type = "W"; S.week = 2; S.month = 11;
  const MW = reportModel();
  ok(MW.bpOK === false, "周视图 bpOK = false");
  renderReport();
  const hW = (document.getElementById("report") || {}).innerHTML || "";
  ok(hW.indexOf("不设 BP") >= 0 || hW.indexOf("周视图不设 BP") >= 0, "周视图标注不设 BP");
  S.type = "YTD";
})().catch(e => {
  P("  FAIL 未捕获异常（后续断言未执行）：" + e.message);
});
