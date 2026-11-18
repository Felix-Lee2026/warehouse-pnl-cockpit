const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  DB.meta.headcount = 300;

  P("=== 1. 期末库存：各项目求和 ===");
  const p = period(), projs = projSet();
  const cbm = latestQtySum(p.from, p.to, "Q02", projs);
  let man = 0, n = 0;
  DB.projects.forEach(pr => {
    const v = latestQty(p.from, p.to, "Q02", [pr.id]);
    if (v !== null && isFinite(v)) { man += v; n++; }
  });
  ok(Math.abs(cbm - man) < 1e-9, "仓级 " + cbm + " = 各项目之和 " + man + "（" + n + " 个项目）");
  const one = latestQty(p.from, p.to, "Q02", projs);
  ok(cbm >= one && cbm > 0, "大于等于单条记录 " + one + "（旧口径只取这一条）");
  ok(latestQtySum(p.from, p.to, "Q02", ["P01"]) === latestQty(p.from, p.to, "Q02", ["P01"]),
     "单项目视角 = 该项目期末值");

  P("=== 2. 库存周转已移除（量纲无业务含义：单 ÷ 立方 跨颗粒度相除）===");
  ok(global.SRC.indexOf('"库存周转"') < 0 && global.SRC.indexOf(">库存周转<") < 0,
     "源码里不再把「库存周转」当标签使用（注释里可留历史记录）");
  ok(global.SRC.indexOf("次/月") < 0, "不再输出「次/月」量纲");
  ok(typeof reportModel().turn === "undefined", "reportModel 不再产出 turn 字段");
  const agg = periodAgg(p, projs), ord = agg.qty["Q03"] || 0, months = periodMonths(p.from, p.to);
  P("  仍保留的库容口径：库存 " + fmtInt(cbm) + " m³ / 期间 " + months.toFixed(2) + " 月 / 出库 " + fmtInt(ord) + " 单");
  ok(cbm > 0 && ord > 0, "原始数据仍在（只是不再算成周转）");

  P("=== 3. 变化率的时间轴 ===");
  const rows = unitTrend(projs);
  P("  月份 " + rows.map(r => r.m).join(","));
  ok(rows.length >= 2, "至少两个月");
  ok(rows[0].dOrd === null, "首月无基期 → 环比为空");
  const curM = new Date().getMonth() + 1;
  const curYm = Y + "-" + pad(curM);
  const curIncomplete = lastDayOf(curYm) < daysInMonth(Y, curM);
  /* 行为变了：未完月保留刻度占位，但值为 null（不出数、不进环比） */
  const curRow = rows.filter(r => r.ym === curYm)[0];
  ok(!curIncomplete || (curRow && curRow.ord === null && curRow.dOrd === null),
     "当月未过完则占位但不出数（" + curM + " 月：" + (curRow ? "partial=" + !!curRow.partial : "不在窗口内") + "）");
  ok(rows.every(r => r.m >= 1 && r.m <= 12), "月份落在 1–12");

  P("=== 3b. X 轴固定 12 个自然月、跨年连续 ===");
  S.year = 2026; S.type = "YTD"; S.project = "ALL";
  const w12 = unitTrend(projSet());
  ok(w12.length === 12, "恒为 12 个刻度（当前 " + w12.length + "）");
  const endYm = period().to.slice(0, 7);
  ok(w12[11].ym === endYm, "末位 = 期间终点 " + endYm);
  ok(w12[0].ym === "2025-12", "首位 = 终点前推 11 个月 " + w12[0].ym + "（跨年）");
  // 连续性：相邻两格必须正好差一个月（含 12→1 跨年）
  /* 相邻两格的间隔必须正好是「上一个月」的天数（28–31）；
     跳月（如 3→5）会是 59–62 天，能立刻抓出来。跨年 12→1 是 31 天，也在范围内。 */
  let mono = true, gaps = [];
  for (let i = 1; i < w12.length; i++) {
    const diff = (new Date(w12[i].ym + "-01") - new Date(w12[i - 1].ym + "-01")) / 86400000;
    gaps.push(diff);
    if (diff < 28 || diff > 31) mono = false;
  }
  ok(mono, "12 格逐月连续（跨年 12→1 也连续），间隔 " + gaps.join("/") + " 天");
  // 跨年标签：上年月份带两位年份
  const svg12 = unitTrendSVG(w12);
  ok(svg12.indexOf("25/12") >= 0, "上年月份标注「25/12」，避免「12月」歧义");
  // 空月 / 未完月：占位但不出数
  const empties = w12.filter(r => r.empty || r.partial);
  P("  占位月份 " + empties.length + " 个：" + empties.map(r => r.ym).join(","));
  ok(empties.every(r => r.ord === null && r.dOrd === null), "占位月份不出数、不进环比");
  const firstReal = w12.findIndex(r => r.ord !== null);
  if (firstReal > 0) ok(w12[firstReal].dOrd === null, "数据起点月无基期（前一格是空的）");
  // 换到 2027 年：窗口整体后移、仍跨年
  S.year = 2027; S.type = "M"; S.month = 2;
  const w27 = unitTrend(projSet());
  ok(w27.length === 12 && w27[11].ym === "2027-02", "2027年2月窗口末位 2027-02");
  ok(w27[0].ym === "2026-03", "首位 2026-03（跨年连续）");
  S.year = 2026; S.type = "YTD";

  P("=== 4. 环比数学 ===");
  let mathOk = true, sample = "";
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i], pv = rows[i - 1];
    if (c.dOrd === null) continue;
    const want = (c.ord - pv.ord) / Math.abs(pv.ord) * 100;
    if (Math.abs(want - c.dOrd) > 1e-9) mathOk = false;
    if (!sample) sample = c.m + "月 " + c.dOrd.toFixed(2) + "% vs 手算 " + want.toFixed(2) + "%";
  }
  ok(mathOk, "单量环比逐月与手算一致（" + sample + "）");
  let perOk = true;
  for (const r of rows) {
    if (r.per === null) continue;
    if (Math.abs(r.per - r.labor / r.ord) > 1e-9) perOk = false;
  }
  ok(perOk, "每单人力成本 = 人力成本 ÷ 出库单");
  /* 指标本身仍在算（等业务量口径换成「件」后再展示），但默认不画线 */
  ok(SHOW_PER_ORDER === false, "每单人力成本线默认关闭（SHOW_PER_ORDER=false）");
  const rowsP = unitTrend(projSet());
  ok(rowsP.some(r => r.per !== null), "per 字段仍在计算（数据没丢）");
  const svgNoPer = unitTrendSVG(rowsP);
  ok(svgNoPer.indexOf('stroke-dasharray="5 3"') < 0, "SVG 里不再有那条灰虚线");
  /* 隐藏的线不能参与纵轴定标。
     构造：可见线只有 ±5%，隐藏线 dPer=999。
       若 dPer 参与 → 第二大绝对值就是 999 → hi 封顶 150%
       若不参与     → 可见最大 5% → hi = 10%
     用「有没有 +150% 刻度」就能真正区分两种实现。 */
  const noPerSpike = [
    {m: 3, dOrd: null, dLab: null, dPer: 999},
    {m: 4, dOrd: 5, dLab: null, dPer: 999},
    {m: 5, dOrd: 5, dLab: null, dPer: 999}
  ];
  const svgSpike = unitTrendSVG(noPerSpike);
  ok(svgSpike.indexOf("+150%") < 0, "隐藏线的 999% 没把纵轴撑到封顶");
  ok(svgSpike.indexOf("+10%") >= 0, "纵轴按可见线定标为 ±10%");

  P("=== 5. 断档月不算环比 ===");
  const saved = DB.facts;
  const cut = Y + "-05";
  DB.facts = DB.facts.filter(f => f.d.slice(0, 7) !== cut);
  _lastDayCache[cut] = 0;
  const r2 = unitTrend(projs);
  const june = r2.find(x => x.m === 6);
  ok(!!june && june.dOrd === null, "5 月被删后，6 月不跟 4 月比（dOrd=" + (june ? june.dOrd : "?") + "）");
  const mayRow = r2.filter(x => x.ym === cut)[0];
  ok(!!mayRow && mayRow.empty === true && mayRow.ord === null, "5 月保留刻度占位、标记 empty（折线在此断开）");
  DB.facts = saved;

  P("=== 6. 人力成本剥离汇率 ===");
  const before = unitTrend(projs).map(r => r.dLab);
  const savedRates = {};
  Object.keys(DB.rates || {}).forEach(k => { savedRates[k] = DB.rates[k]; DB.rates[k] *= 1.25; });
  const after = unitTrend(projs).map(r => r.dLab);
  const same = before.every((v, i) => v === null || Math.abs(v - after[i]) < 1e-9);
  ok(same, "汇率 +25% 后人力成本环比完全不变（看的是管理动作，不是汇兑）");
  Object.keys(savedRates).forEach(k => DB.rates[k] = savedRates[k]);
  // 但 RMB 口径的人力成本会变 —— 反证两者确实是两条路
  const laborRMB = n => monthAgg(Y + "-" + pad(n), projs).d.labor;
  ok(laborRMB(6) > 0, "RMB 口径人力成本仍按汇率折算 " + laborRMB(6).toFixed(0));

  P("=== 7. SVG 纵轴方向 ===");
  const svg = unitTrendSVG(rows);
  const ticks = (svg.match(/text-anchor="end">([^<]+)</g) || []).map(s => s.replace(/.*>/, "").replace("<", ""));
  P("  刻度 " + ticks.join(" "));
  ok(ticks.length === 5, "5 条水平刻度");
  ok(ticks[0].indexOf("-") !== 0 && ticks[0] !== "0%", "顶部为正：" + ticks[0]);
  ok(ticks[4].indexOf("-") === 0, "底部为负：" + ticks[4]);
  ok(ticks[2] === "0%", "中间是零轴");
  // 正数点必须画在零轴以上
  const zeroY = 18 + (272 - 18 - 46) / 2;
  const firstPos = rows.find(r => r.dOrd !== null && r.dOrd > 5);
  const circles = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)].map(m => ({ x: +m[1], y: +m[2] }));
  ok(circles.length > 0 && circles.some(c => c.y < zeroY - 1), "存在零轴上方的点（正增长）");
  ok(circles.some(c => c.y > zeroY + 1), "存在零轴下方的点（负增长）");

  P("=== 8. 极值裁顶 ===");
  const spike = [
    {m: 3, dOrd: null, dLab: null, dPer: null},
    {m: 4, dOrd: 340, dLab: 25, dPer: -18},
    {m: 5, dOrd: -13, dLab: -13, dPer: 0},
    {m: 6, dOrd: 215, dLab: 77, dPer: 43},
    {m: 7, dOrd: -16, dLab: -30, dPer: -17}
  ];
  const sp = unitTrendSVG(spike);
  ok(sp.indexOf("▲340%") >= 0, "340% 标 ▲340%");
  ok(sp.indexOf("+150%") >= 0 && sp.indexOf("-150%") >= 0, "纵轴封顶 ±150%");
  const spY = [...sp.matchAll(/cy="([\d.]+)"/g)].map(m => +m[1]);
  ok(Math.min(...spY) >= 18 - 0.01, "裁顶点不越出上边界 " + Math.min(...spY).toFixed(1));
  ok(Math.max(...spY) <= 226 + 0.01, "不越出下边界 " + Math.max(...spY).toFixed(1));

  P("=== 9. 空/单点不崩 ===");
  ok(unitTrendSVG([]) === "", "空序列 → 空串");
  ok(unitTrendSVG([{m: 1, dOrd: null, dLab: null, dPer: null}]) === "", "单月 → 空串（画不出线）");
  const savedFacts = DB.facts;
  DB.facts = [];
  let crashed = null;
  try { renderUnit(); } catch (e) { crashed = e.message; }
  ok(!crashed, "清空数据后渲染不报错" + (crashed ? "：" + crashed : ""));
  const eh = (_lastHTML["unit"] || {}).innerHTML || "";
  ok(eh.indexOf("还没有业务量数据") >= 0, "清空后提示补录");
  DB.facts = savedFacts;

  P("=== 10. 渲染结构 ===");
  renderUnit();
  const h = (_lastHTML["unit"] || {}).innerHTML || "";
  ok((h.match(/class="unitbox"/g) || []).length === 0, "右侧指标格已全部移除");
  ok(h.indexOf("<svg") >= 0, "出图");
  ok(h.indexOf("单均利润") < 0 && h.indexOf("单均成本") < 0 && h.indexOf("库存周转") < 0, "三格内容已移除");
  ok(h.indexOf("单均收入") < 0 && h.indexOf("每柜成本") < 0 && h.indexOf("每单人力成本</div>") < 0, "更早的四/五/六格也没回来");
  ok(h.indexOf("unitkpi") < 0 && h.indexOf("unitwrap") < 0, "不再使用双栏容器");
  ok(/const W = 980/.test(global.SRC), "图宽度已加宽（W=980）");
  ok(h.indexOf("在编 <b>300</b> 人") >= 0, "底部保留人均指标");
  ok(h.indexOf("环比上月") >= 0, "图注说明环比口径");
  /* 卡片标题由用户指定措辞，锁定防回退 */
  ok(global.SRC.indexOf("<h3>单量与人力成本环比趋势</h3>") >= 0, "卡片标题为「单量与人力成本环比趋势」");
  ok(global.SRC.indexOf("<h3>单量与人力成本趋势</h3>") < 0, "旧标题已不存在");
  ok(global.SRC.indexOf('id="unit"') < global.SRC.indexOf('id="cmp"'),
     "趋势模块排在「各项目横向对比」之前（页面顺序）");

  P("=== 11. 单项目视角 ===");
  S.project = "P01";
  const h1svg = unitTrendSVG(unitTrend(projSet()));
  ok(h1svg.indexOf("<svg") >= 0 || h1svg === "", "单项目也能出图/或不强行出图");
  renderUnit();
  const h1 = (_lastHTML["unit"] || {}).innerHTML || "";
  ok(h1.indexOf("空置") < 0, "单项目视角不再出现空置字样（副标已随三格一并移除）");
  S.project = "ALL";

  P("=== 12. 各期间回归 ===");
  let nErr = 0;
  ["YTD", "MTD", "M", "W"].forEach(t => {
    S.type = t; S.month = new Date().getMonth() + 1; S.week = 2;
    try { renderUnit(); } catch (e) { nErr++; P("    FAIL " + t + " :: " + e.message); }
  });
  ok(nErr === 0, "四个期间渲染均无异常");
  S.type = "YTD";
})().catch(e => {
  P("  FAIL 未捕获异常（后续断言未执行）：" + e.message);
});
