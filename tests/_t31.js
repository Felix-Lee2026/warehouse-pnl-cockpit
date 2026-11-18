const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);
const txt = h => (h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  await init();
  S.year = 2026; S.type = "YTD"; S.project = "ALL";
  DB.meta.cbmCap = 10000; DB.meta.palletCap = 1200; DB.meta.headcount = 300;

  P("=== 1. 公摊识别：名称含「分摊」的固定成本 ===");
  const aP04 = periodAgg(period(), ["P04"]).acc;
  const alloc04 = allocFixedOf(aP04);
  // 手算：C01.02 分摊场地 + C05.03 其他分摊
  const manAlloc = Math.abs(aP04["C01.02"] || 0) + Math.abs(aP04["C05.03"] || 0);
  ok(Math.abs(alloc04 - manAlloc) < 1, "P04 公摊 " + fmtMoney(alloc04) + " = 手算 C01.02+C05.03 " + fmtMoney(manAlloc));
  ok(alloc04 > 0, "公摊为正（不为 0 才有意义）");
  // 空置 C08 属 P000，不在项目内
  ok(Math.abs(aP04["C08"] || 0) === 0, "项目 acc 里没有 C08 空置（空置只在 P000）");

  P("=== 2. 自身利润 = 报表利润 + 公摊 ===");
  const M = reportModel();
  let maxGap = 0;
  M.ps.forEach(x => {
    maxGap = Math.max(maxGap, Math.abs(x.selfProfit - (x.profit + x.allocF)));
  });
  ok(maxGap < 1, "五个项目自身利润恒等式成立，最大误差 " + maxGap.toFixed(2) + " 元");
  const d04 = M.ps.filter(x => x.id === "P04")[0];
  P("  客户D：报表 " + fmtMoney(d04.profit) + " + 公摊 " + fmtMoney(d04.allocF) + " = 自身 " + fmtMoney(d04.selfProfit));
  ok(d04.profit < 0 && d04.selfProfit > 0,
     "客户D 报表亏损(" + fmtMoney(d04.profit) + ")但自身为正(" + fmtMoney(d04.selfProfit) + ") —— 口径确实翻转了结论");
  ok(d04.selfMargin !== null && d04.selfMargin < 0.03,
     "客户D 自身利润率 " + fmtPct(d04.selfMargin) + " 极低（勉强打平，不是健康）");

  P("=== 3. 真亏判据用自身利润，不用报表利润 ===");
  const negByReport = M.projRows.filter(x => x.d.profit < 0);
  const negBySelf = M.projRows.filter(x => x.selfProfit < 0);
  P("  报表口径亏损项目 " + negByReport.length + " 个 / 自身口径 " + negBySelf.length + " 个");
  ok(negByReport.length > 0, "报表口径有亏损项目（" + negByReport.length + " 个）");
  ok(negBySelf.length === 0, "自身口径无亏损项目 —— 五个业务都是正贡献，不该砍");
  const issueDims = M.issues.map(x => x.title).join(" ");
  ok(issueDims.indexOf("自身亏") < 0, "问题清单里不再出现「自身亏」（真亏判据正确）");

  P("=== 4. 人力判据：同类中位数，不是 35% ===");
  ok(global.SRC.indexOf("laborRate: 0.35") >= 0, "DIAG_T.laborRate 定义保留（兼容旧备份）");
  ok(global.SRC.indexOf("labRate <= DIAG_T.laborRate") < 0 && global.SRC.indexOf("labRate > DIAG_T.laborRate") < 0,
     "没有任何地方再用 35% 绝对线做判定（防回归）");
  const labIssue = M.issues.filter(x => x.dim === "人力")[0];
  ok(!!labIssue, "人力维度有输出");
  ok(labIssue.title.indexOf("35%") < 0, "标题里不再出现 35%：" + labIssue.title.slice(0, 40));
  ok(labIssue.title.indexOf("中位数") >= 0, "标题写明比较基准是项目中位数");
  // 中位数手算
  const labPCs = M.ps.filter(x => x.laborPerContrib !== null).map(x => x.laborPerContrib).sort((a, b) => a - b);
  const mid = labPCs.length % 2 ? labPCs[(labPCs.length - 1) / 2]
    : (labPCs[labPCs.length / 2 - 1] + labPCs[labPCs.length / 2]) / 2;
  ok(Math.abs(M.medLabPC - mid) < 1e-9, "中位数 " + fmtPct(M.medLabPC) + " = 手算 " + fmtPct(mid));
  // 点名的是最高的两个，且都高于中位数
  const top2 = M.ps.filter(x => x.laborPerContrib !== null).sort((a, b) => b.laborPerContrib - a.laborPerContrib).slice(0, 2);
  ok(top2.every(x => x.laborPerContrib >= M.medLabPC), "被点名的两项都高于中位数");
  ok(top2.every(x => labIssue.title.indexOf(x.name.slice(0, 4)) >= 0),
     "标题点名最高的两项：" + top2.map(x => x.name).join("、"));
  ok(labIssue.detail.indexOf("仅参考") >= 0, "人力成本率标注为「仅参考」");

  P("=== 5. 砍掉的代价：区间计算 ===");
  const qh = rpQuitCost(M);
  ok(qh.indexOf("砍掉的代价") >= 0, "小节存在");
  M.ps.forEach(x => {
    const selfFix = x.cF - x.allocF;
    const best = selfFix + x.cS - x.contrib;
    const worst = x.cS - x.contrib;
    ok(best >= worst, x.name.slice(0, 6) + " 最好情况(" + fmtMoney(best) + ") ≥ 最坏情况(" + fmtMoney(worst) + ")");
    ok(qh.indexOf(fmtMoney(best)) >= 0, x.name.slice(0, 6) + " 最好情况入表");
    ok(qh.indexOf(fmtMoney(worst)) >= 0, x.name.slice(0, 6) + " 最坏情况入表");
  });
  // demo 下所有项目 best < 0 → 全部"不该砍"
  const allNeg = M.ps.every(x => (x.cF - x.allocF) + x.cS - x.contrib < 0);
  ok(allNeg, "五个项目最好情况全为负 —— 无论固定成本能否退出，砍掉都亏");
  ok(qh.indexOf("不该砍") >= 0, "表里出现「不该砍」判定");

  P("=== 6. 项目表现表：8 列 + 自身口径 ===");
  const ph = rpProjTable(M);
  const thN = (ph.split("</thead>")[0].match(/<th[ >]/g) || []).length;
  ok(thN === 8, "表头 " + thN + " 列（项目/营收/毛益/cmr/报表利润/公摊/自身利润/自身利润率）");
  ok(ph.indexOf("自身利润") >= 0 && ph.indexOf("其中公摊") >= 0, "含自身口径两列");
  ok(ph.indexOf("自身利润 = 报表利润 + 公摊") >= 0, "表下注明恒等关系");
  ok(ph.indexOf("报表利润受分摊规则影响") >= 0, "表下说明为什么不用报表利润");

  P("=== 7. 增量方向：按 cmr 排序，不设阈值 ===");
  const gIssue = M.issues.filter(x => x.dim === "业务增量" && x.kind === "gap" && x.impact === 0)[0];
  ok(!!gIssue, "有「增量方向」条目（机会类，不是问题）");
  ok(gIssue.title.indexOf("增量优先") >= 0, "标题：" + gIssue.title.slice(0, 40));
  const byCmr = M.ps.filter(x => x.cmr !== null).sort((a, b) => b.cmr - a.cmr);
  ok(gIssue.title.indexOf(byCmr[0].name.slice(0, 4)) >= 0, "点名 cmr 最高的 " + byCmr[0].name);
  ok(gIssue.level === "info", "等级为 info（机会），不占用「预警」位");
  const ih = rpIssueTable(M);
  ok(ih.indexOf("机会") >= 0, "问题表里等级列显示「机会」");
  ok(ih.indexOf("三类金额不能相加") >= 0, "保留三类金额不可相加的说明");

  P("=== 8. 口径段：硬线 / 经验线分开标注 ===");
  const fh = rpFootNote(M);
  ok(fh.indexOf("硬线") >= 0 && fh.indexOf("人力 ÷ 毛益 100%") >= 0, "标出恒等式硬线");
  ok(fh.indexOf("经验默认值") >= 0, "经验线标注为默认值");
  ok(fh.indexOf("非行业标准") >= 0, "明确否认行业标准");
  ok(fh.indexOf("请按自身历史校准") >= 0, "给出校准指引");
  ok(fh.indexOf("自身利润") >= 0, "标明砍/留判据是自身利润");
  ok(fh.indexOf("不用于砍/留决策") >= 0, "明确报表利润不参与决策");

  P("=== 9. 构造真亏项目：判据必须触发 ===");
  const bf = JSON.parse(JSON.stringify(DB.facts));
  const br = JSON.parse(JSON.stringify(DB.rent || {}));
  const bd = DB.meta.rentDefault;
  DB.facts = [
    {d: "2026-01-01", p: "P01", a: "R02.01", v: 100000, src: "import"},
    {d: "2026-01-01", p: "P01", a: "C01.01", v: 50000, src: "import"},
    {d: "2026-01-01", p: "P01", a: "C02.01.01", v: 80000, src: "import"}
  ];
  DB.rent = {}; DB.meta.rentDefault = 0; DB.meta.rentTotal = 0;
  _spillCache = {}; mCache = {}; _lastDataCache = null;
  const ML = reportModel();
  const bad = ML.projRows.filter(x => x.selfProfit < 0);
  P("  构造后：营收 " + fmtMoney(ML.d.rev) + " 毛益 " + fmtMoney(ML.d.contrib) +
    " 项目自身利润 " + (ML.ps[0] ? fmtMoney(ML.ps[0].selfProfit) : "—"));
  ok(bad.length > 0, "自身亏的项目被识别：" + bad.map(x => x.name).join("、"));
  ok(ML.issues.some(x => x.title.indexOf("自身亏") >= 0), "问题清单出现「自身亏」条目");
  DB.facts = bf; DB.rent = br; DB.meta.rentDefault = bd;
  _spillCache = {}; mCache = {}; _lastDataCache = null;

  P("=== 10. 渲染不崩 ===");
  S.project = "ALL"; reportMode = "full"; goPage("report");
  const full = (document.getElementById("report") || {}).innerHTML || "";
  ok(full.length > 3000, "完整版渲染 " + full.length + " 字符");
  ok(full.indexOf("砍掉的代价") >= 0, "完整版含「砍掉的代价」");
  ok(full.indexOf("项目分流参考") >= 0, "标题完整");
  reportMode = "brief"; renderReport();
  const brief = (document.getElementById("report") || {}).innerHTML || "";
  ok(brief.length > 500 && brief.length < full.length, "一页纸 " + brief.length + " 字符（短于完整版）");
  reportMode = "full";
})().catch(e => {
  P("  FAIL 未捕获异常（后续断言未执行）：" + e.message);
  P((e.stack || "").split("\n").slice(0, 3).join("\n"));
});
