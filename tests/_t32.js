const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  S.year = 2026; S.type = "YTD"; S.project = "ALL";
  DB.meta.cbmCap = 10000; DB.meta.headcount = 300;
  const projs = projSet();

  P("=== 1. 趋势卡片的绝对值表 ===");
  const rows = unitTrend(projs);
  const endY = rows[rows.length - 1].y;
  const mt = monoTable(rows, endY);
  ok((mt.match(/<th[ >]/g) || []).length === 13, "表头 13 个（月份 + 12 个月份列）");
  ok(mt.indexOf("出库单量") >= 0 && mt.indexOf("人力成本") >= 0, "两行：出库单量 / 人力成本");
  ok((mt.match(/<tr/g) || []).length === 3, "共 3 行（表头 + 2 数据行）");
  // 只放绝对值，不放环比
  ok(mt.indexOf("%") < 0, "表里不出现百分比（环比归图）");
  // 空月显示 —
  const naCount = (mt.match(/class="na"/g) || []).length;
  const emptyCount = rows.filter(r => r.ord === null).length;
  ok(naCount === emptyCount * 2, "空格 " + emptyCount + " 个 → " + naCount + " 个「—」（两行各一次）");
  // 数值必须与 unitTrend 对齐
  const firstReal = rows.find(r => r.ord !== null);
  ok(firstReal && mt.indexOf(fmtInt(firstReal.ord)) >= 0, "首个有数月份的单量入表 " + (firstReal ? fmtInt(firstReal.ord) : "—"));
  /* 人力成本是录入原币（entryCcy），不是 RMB —— 符号必须是 $ 而不是 ¥ */
  ok(mt.indexOf(fmtCcy(firstReal.labor)) >= 0, "首个有数月份的人力成本入表（原币 " +
     fmtCcy(firstReal.labor) + "）");
  ok(entryCcy() !== "USD" || mt.indexOf("$") >= 0, "USD 录入时用 $ 符号，不冒充人民币");
  ok(mt.indexOf("人力成本（" + entryCcy() + "）") >= 0, "行名标明币种：" + entryCcy());
  ok(entryCcy() !== "USD" || mt.indexOf("¥") < 0, "表格里不该出现 ¥（那是 RMB 符号）");
  // 标签与图共用同一套写法
  ok(mt.indexOf(">25/12<") >= 0 || mt.indexOf(">25/12") >= 0, "跨年月份标签与图一致（25/12）");

  P("=== 2. 成本率趋势：数据层 ===");
  const cr = costRateTrend(projs);
  ok(cr.length === 12, "恒为 12 个月");
  const filled = cr.filter(r => r.tot !== null);
  P("  有数据 " + filled.length + " 个月：首 " + (filled[0] ? filled[0].ym : "—") +
    " 末 " + (filled[filled.length - 1] ? filled[filled.length - 1].ym : "—"));
  ok(filled.length >= 2, "至少两个月有成本率");
  // 手算校验一个月
  const chk = filled[0];
  const a1 = monthAgg(chk.ym, projs);
  const b1 = costBuckets(a1.acc);
  ok(Math.abs(chk.tot - b1.total / a1.d.rev) < 1e-9, chk.ym + " 总成本率 = 总成本 ÷ 营收 = " + chk.tot.toFixed(3));
  ok(Math.abs(chk.lab - b1.labor / a1.d.rev) < 1e-9, "人力率 " + chk.lab.toFixed(3));
  ok(Math.abs(chk.rent - b1.rent / a1.d.rev) < 1e-9, "仓租率 " + chk.rent.toFixed(3));
  ok(chk.lab <= chk.tot + 1e-9 && chk.rent <= chk.tot + 1e-9, "分项成本率不超过总成本率");
  // 未完月 / 空月不出点
  const curYm = new Date().getFullYear() + "-" + pad(new Date().getMonth() + 1);
  const cur = cr.filter(r => r.ym === curYm)[0];
  ok(!cur || cur.tot === null, "当月未过完不出点（" + (cur ? "partial=" + !!cur.partial : "不在窗口") + "）");

  P("=== 3. 营收为 0 的月份必须跳过 ===");
  const bf = JSON.parse(JSON.stringify(DB.facts));
  // 造一个营收为 0 但有成本的月份
  const zeroYm = filled[0].ym;
  DB.facts = DB.facts.filter(f => f.d.slice(0, 7) !== zeroYm);
  DB.facts.push({d: zeroYm + "-01", p: "P01", a: "C01.01", v: 50000, src: "import"});
  _lastDayCache[zeroYm] = 1; mCache = {}; _lastDataCache = null;
  const cr2 = costRateTrend(projs);
  const z = cr2.filter(r => r.ym === zeroYm)[0];
  ok(z && z.noRev === true && z.tot === null, zeroYm + " 营收为 0 → 标记 noRev、不出点（避免 ÷0）");
  DB.facts = bf; _lastDayCache[zeroYm] = 0; mCache = {}; _lastDataCache = null;

  P("=== 4. 成本率图：渲染 ===");
  const svg = costRateSVG(costRateTrend(projs));
  ok(svg.indexOf("<svg") >= 0, "出图");
  ok((svg.match(/<polyline/g) || []).length >= 2, "至少两条线");
  ["#d85a30", "#85b7eb", "#9fb8cd"].forEach(c => {
    ok(svg.indexOf(c) >= 0, "含颜色 " + c + "（对应一条线）");
  });
  // 只给主线条标数字：数值标签数应等于有数据的月份数
  const nums = (svg.match(/fill="#b8471f"/g) || []).length;
  ok(nums === filled.length, "主线条数字 " + nums + " 个 = 有数据月份 " + filled.length + " 个（另两条不标）");
  // 单点不崩
  const one = [{ym: "2026-01", m: 1, y: 2026, tot: 0.9, lab: 0.4, rent: 0.3}];
  ok(costRateSVG(one) === "", "只有一个月 → 空串（画不出趋势）");

  P("=== 4b. 悬停提示 ===");
  ok((svg.match(/fill="transparent"><title>/g) || []).length === 12, "12 个月各一个透明热区");
  ok(svg.indexOf("总成本率 0.") >= 0, "提示里含总成本率");
  ok(svg.indexOf("人力 / 营收 0.") >= 0, "提示里含人力/营收（这条线不标数字，靠悬停看）");
  ok(svg.indexOf("仓租 / 营收 0.") >= 0, "提示里含仓租/营收");
  // 空月也要有提示，且说明原因
  ok(svg.indexOf("当月未过完，不参与") >= 0 || svg.indexOf("无明细数据") >= 0, "空月热区给出原因");

  P("=== 4c. 画不出时要说明原因 ===");
  ok(costRateWhy(costRateTrend(projs)) === "", "数据充足时不显示警告");
  const w1 = costRateWhy([{ym: "2026-01", m: 1, y: 2026, tot: 0.9, lab: 0.4, rent: 0.3},
                          {ym: "2026-02", m: 2, y: 2026, tot: null, lab: null, rent: null, empty: true}]);
  ok(w1.indexOf("「1月」这一个月") >= 0, "单月时说明「只有 X 月一个月」：" + w1.slice(0, 40));
  const w2 = costRateWhy([{ym: "2026-01", m: 1, y: 2026, tot: null, lab: null, rent: null, noRev: true},
                          {ym: "2026-02", m: 2, y: 2026, tot: null, lab: null, rent: null, noRev: true}]);
  ok(w2.indexOf("有成本但没营收") >= 0, "有成本没营收时点名月份");
  ok(w2.indexOf("营收为 0 时算不出来") >= 0, "解释为什么算不出来");
  const w3 = costRateWhy([{ym: "2026-01", m: 1, y: 2026, tot: 0.9, lab: 0.4, rent: 0.3},
                          {ym: "2026-02", m: 2, y: 2026, tot: null, lab: null, rent: null, partial: true}]);
  ok(w3.indexOf("当月未过完") >= 0, "未完月也写进原因");

  P("=== 5. 纵轴抗极值 ===");
  const spike = [
    {ym: "2026-01", m: 1, y: 2026, tot: 0.9, lab: 0.4, rent: 0.3},
    {ym: "2026-02", m: 2, y: 2026, tot: 0.95, lab: 0.42, rent: 0.31},
    {ym: "2026-03", m: 3, y: 2026, tot: 12.5, lab: 0.5, rent: 0.33},   // 异常月（营收极低）
    {ym: "2026-04", m: 4, y: 2026, tot: 0.88, lab: 0.39, rent: 0.29}
  ];
  const sp = costRateSVG(spike);
  /* 第二大值是 0.95 → 0.95×1.05=0.9975 → 取下一档 1.0，再被平衡线抬到 1.2。
     12.5 这个异常月被裁顶，其余三个月的差异（0.88~0.95）仍然分得开 —— 这就是抗极值的目的。 */
  ok(sp.indexOf(">1.20<") >= 0, "纵轴按第二大值定档、再抬到 1.20（容下平衡线），没被 12.5 撑爆");
  ok(sp.indexOf(">12.5") < 0 && sp.indexOf(">12.50<") < 0, "纵轴刻度里没有 12.5");
  ok(sp.indexOf("▲") >= 0, "超界点标 ▲ 提示被裁顶");

  P("=== 5b. 盈亏平衡线（成本率 = 1.00）===");
  ok(sp.indexOf('stroke="#e24b4a" stroke-width="1.2" stroke-dasharray="4 3"') >= 0, "红色虚线存在");
  ok(sp.indexOf(">1.00<") >= 0, "轴上标出 1.00");
  /* 线的 y 必须落在绘图区内（PT=16，ch=236-16-40=180 → 16~196） */
  const y1 = +((sp.match(/<line[^>]*y1="([\d.]+)"[^>]*stroke="#e24b4a"/) || [])[1]);
  ok(y1 >= 16 && y1 <= 196, "平衡线在绘图区内 y=" + y1);
  /* hi=1.2 → yOf(1) = 16 + 180 - (1/1.2)*180 = 46 */
  ok(Math.abs(y1 - 46) < 1.5, "平衡线位置 = yOf(1.00)（实测 " + y1 + "，应约 46）");
  /* 数据全部低于 1 时，纵轴也必须抬到 1.2，否则线会在画面外 */
  const lowAll = [
    {ym: "2026-01", m: 1, y: 2026, tot: 0.42, lab: 0.2, rent: 0.1},
    {ym: "2026-02", m: 2, y: 2026, tot: 0.45, lab: 0.21, rent: 0.11},
    {ym: "2026-03", m: 3, y: 2026, tot: 0.41, lab: 0.19, rent: 0.09}
  ];
  const sl = costRateSVG(lowAll);
  ok(sl.indexOf(">1.20<") >= 0, "数据全部远低于 1 → 纵轴仍抬到 1.20（平衡线不会被挤出画面）");
  ok(sl.indexOf(">1.00<") >= 0, "此时 1.00 仍标在轴上");
  /* 成本率超过 1 的月份：数据点必须落在红线之上（视觉上"越线"）。
     这组数据的第二大值 1.2 → 上限 1.5，1.35 不会被裁顶，正好能干净地验证位置。 */
  const over = [
    {ym: "2026-01", m: 1, y: 2026, tot: 0.9, lab: 0.4, rent: 0.3},
    {ym: "2026-02", m: 2, y: 2026, tot: 1.35, lab: 0.5, rent: 0.32},
    {ym: "2026-03", m: 3, y: 2026, tot: 1.2, lab: 0.48, rent: 0.31}
  ];
  const so = costRateSVG(over);
  const y1o = +((so.match(/<line[^>]*y1="([\d.]+)"[^>]*stroke="#e24b4a"/) || [])[1]);
  ok(y1o > 16 && y1o < 196, "有月份超 1 时平衡线仍在图内 y=" + y1o);
  const cys = [...so.matchAll(/<circle[^>]*cy="([\d.]+)"/g)].map(m => +m[1]);
  ok(cys.some(v => v < y1o - 1), "成本率 > 1.00 的月份，数据点画在红线之上（" +
     cys.map(v => v.toFixed(0)).join("/") + " vs 线 " + y1o.toFixed(0) + "）");
  ok(so.indexOf("▲") < 0, "1.35 未超纵轴上限，没有被裁顶");

  P("=== 5c. 图例说明平衡线 ===");
  S.type = "YTD"; S.month = 11;
  goPage("cost");
  const hc = (document.getElementById("cost") || {}).innerHTML || "";
  ok(hc.indexOf("盈亏平衡 1.00") >= 0, "图例含「盈亏平衡 1.00」");
  ok(hc.indexOf("越过红线即亏损") >= 0, "图注写明越过红线即亏损");

  P("=== 6. 周视图不出图 ===");
  S.type = "W"; S.month = 11; S.week = 2;
  goPage("cost");
  const hW = (document.getElementById("cost") || {}).innerHTML || "";
  ok(hW.indexOf("costratebox") < 0, "周视图下没有成本率图");
  ok(hW.indexOf("每 1 元营收成本") >= 0, "但指标卡仍在（周视图照常看当期值）");
  S.type = "YTD"; S.month = 11;
  goPage("cost");
  const hY = (document.getElementById("cost") || {}).innerHTML || "";
  ok(hY.indexOf("costratebox") >= 0, "月/年视图下有图");
  ok(hY.indexOf("近 12 个月") >= 0, "图标题写明区间");
  ok(hY.indexOf("营收为 0 的月份") >= 0, "图注解释排除规则");

  P("=== 7. 项目筛选跟随 ===");
  S.project = "P01"; goPage("cost");
  const crP = costRateTrend(["P01"]);
  const hP = (document.getElementById("cost") || {}).innerHTML || "";
  const filledP = crP.filter(r => r.tot !== null);
  ok(filledP.length >= 2, "单项目也有多个月的数据");
  const aP = monthAgg(filledP[0].ym, ["P01"]);
  const bP = costBuckets(aP.acc);
  ok(Math.abs(filledP[0].tot - bP.total / aP.d.rev) < 1e-9, "单项目成本率按项目口径计算");
  ok(hP.indexOf("costratebox") >= 0, "单项目视角也出图");
  S.project = "ALL";

  P("=== 8. 趋势卡渲染回归 ===");
  S.type = "YTD"; goPage("proj");
  const hU = (document.getElementById("unit") || {}).innerHTML || "";
  ok(hU.indexOf("unitmono") >= 0, "卡片里有明细表");
  ok(hU.indexOf("<svg") >= 0, "图还在");
  ok(hU.indexOf("每单人力成本") < 0, "每单人力成本仍是隐藏状态");
})().catch(e => {
  P("  FAIL 未捕获异常（后续断言未执行）：" + e.message);
  P((e.stack || "").split("\n").slice(0, 3).join("\n"));
});
