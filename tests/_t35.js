const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

/* 业务类型主数据（seg）+ 停运归档规则。
   核心不是「字段存下来了」，而是：
   ① 老库迁移必须落库，不能每次现算 —— 否则同一项目会随月份数据漂移，分类键不稳定
   ② 迁移不能覆盖用户已选定过的值
   ③ 归档基准日取全库最新明细日，不取系统时钟 —— 否则同一份备份换个时钟结论就变
   ④ 类型与形态偏离只提示，不改任何计算 */

(async () => {
  await init();

  P("=== 1. calcSegShare：储存收入占比（不换汇，占比是比率）===");
  const f1 = [
    {p: "A", a: "R02.04", v: 80}, {p: "A", a: "R02.03", v: 20},
    {p: "B", a: "R02.04", v: 10}, {p: "B", a: "R02.03", v: 90},
    {p: "C", a: "R02.04", v: 30}, {p: "C", a: "R02.05", v: 30},
    {p: "D", a: "R02.01", v: 50},
    {p: "E", a: "R", v: 999}
  ];
  const s1 = calcSegShare(f1);
  ok(s1.A === 0.8, "A 储存 80%（" + fmtPct(s1.A) + "）");
  ok(s1.B === 0.1, "B 储存 10%");
  ok(s1.C === 0.5, "C 储存 50%（30/60）");
  ok(s1.D === 0, "D 纯操作 → 0%");
  ok(s1.E === undefined, "总账行 R 不进分母（否则占比被稀释）");
  ok(Object.keys(calcSegShare([])).length === 0, "空明细 → 空映射，不报错");

  P("=== 2. 老库迁移：无 seg → 按 50% 推断并落库 ===");
  const o1 = unpackDB({
    projects: [
      {id: "P000", pub: 1, status: "公共"},
      {id: "P01", name: "temu"},
      {id: "P02", name: "沪上阿姨"},
      {id: "P03", name: "已选定", seg: "ToC"}
    ],
    facts: [
      ["2026-01-31", "P01", "R02.03", 70, 0],
      ["2026-01-31", "P01", "R02.04", 30, 0],
      ["2026-01-31", "P02", "R02.04", 90, 0],
      ["2026-01-31", "P02", "R02.03", 10, 0],
      ["2026-01-31", "P03", "R02.04", 99, 0]
    ]
  });
  const g1 = id => o1.projects.find(x => x.id === id);
  ok(g1("P01").seg === "ToC", "P01 储存 30% → ToC");
  ok(g1("P02").seg === "ToB", "P02 储存 90% → ToB");
  ok(g1("P03").seg === "ToC", "用户已选的 seg 不被结构覆盖（哪怕 99% 储存）");
  ok(g1("P000").seg === "PUB", "公共项目标 PUB，不参与 ToB/ToC 分类");

  P("=== 3. 迁移边界 ===");
  const o2 = unpackDB({projects: [{id: "P09", status: "预导入"}], facts: []});
  ok(o2.projects[0].seg === "ToB", "无明细 → 默认 ToB（仓储业主体），不是 ToC");
  const s2 = calcSegShare([{p: "X", a: "R02.04", v: 51}, {p: "X", a: "R02.03", v: 49},
                           {p: "Y", a: "R02.04", v: 49}, {p: "Y", a: "R02.03", v: 51}]);
  ok(s2.X >= 0.5 && s2.Y < 0.5, "50% 是中点：51% 落 ToB 侧、49% 落 ToC 侧");

  P("=== 4. daysBetween ===");
  ok(daysBetween("2026-01-01", "2026-12-31") === 364, "2026 年 1/1→12/31 = 364 天");
  ok(daysBetween("2026-01-01", "2027-01-01") === 365, "2026 平年 → 365 天");
  ok(daysBetween("2024-01-01", "2025-01-01") === 366, "2024 闰年 → 366 天（不能用 365 硬乘年数）");
  ok(daysBetween("2026-09-30", "2026-09-30") === 0, "同日 = 0");
  ok(daysBetween("bad", "2026-01-01") === 0, "非法日期不炸，回 0");

  P("=== 5. 归档：停运 + 一年无新数据 ===");
  const bakP = DB.projects, bakF = DB.facts;
  DB.projects = [
    {id: "P00", name: "公共", status: "公共", pub: 1},
    {id: "P01", name: "在营但数据很老", status: "在营"},
    {id: "P02", name: "停用但末笔最新", status: "停用"},
    {id: "P03", name: "停用超两年", status: "停用"},
    {id: "P04", name: "停用从无数据", status: "停用"},
    {id: "P05", name: "暂停未满一年", status: "暂停"},
    {id: "P06", name: "停用正好 365 天", status: "停用"},
    {id: "P07", name: "停用 366 天", status: "停用"}
  ];
  DB.facts = [
    {d: "2024-01-31", p: "P01", a: "R02.04", v: 100},
    {d: "2026-09-30", p: "P02", a: "R02.04", v: 100},
    {d: "2024-01-31", p: "P03", a: "R02.04", v: 100},
    {d: "2026-09-30", p: "P05", a: "R02.04", v: 100},
    {d: "2025-09-30", p: "P06", a: "R02.04", v: 100},
    {d: "2025-09-29", p: "P07", a: "R02.04", v: 100}
  ];
  _projDataCache = null;
  const arc = id => isArchived(DB.projects.find(x => x.id === id));
  ok(arc("P00") === false, "公共项目永不归档");
  ok(arc("P01") === false, "在营：数据再老也不归档（归档只看停运状态）");
  ok(arc("P02") === false, "停用但末笔就是全库最新日 → 不归档");
  ok(arc("P03") === true, "停用且末笔两年前 → 归档");
  ok(arc("P04") === true, "停用且从没数据 → 立即归档，不占一年观察期");
  ok(arc("P05") === false, "暂停未满一年 → 照常显示（合计才对得上）");
  ok(arc("P06") === false, "恰好 365 天 → 不归档（规则是「一年以上」= >365）");
  ok(arc("P07") === true, "366 天 → 归档（边界只差一天也要分开）");

  P("=== 6. 归档基准日不取系统时钟 ===");
  const latest = latestDate();
  ok(latest === "2026-09-30", "基准日 = 全库最新明细日 " + latest + "，不是今天");
  ok(daysBetween("2025-09-29", latest) === 366, "按 2026-09-30 算 P07 是 366 天");

  P("=== 7. 形态偏离：只提示，不改计算 ===");
  const sh = {A: 0.1, B: 0.9, C: 0.5, D: 0.49};
  ok(segDeviation({id: "A", seg: "ToB"}, sh) !== null, "ToB 但储存 10% → 提示");
  ok(segDeviation({id: "B", seg: "ToC"}, sh) !== null, "ToC 但储存 90% → 提示");
  ok(segDeviation({id: "C", seg: "ToB"}, sh) === null, "ToB 储存恰好 50% → 不提示（方向一致）");
  ok(segDeviation({id: "D", seg: "ToB"}, sh) !== null, "ToB 储存 49% → 提示（与类型推断同一中点）");
  ok(segDeviation({id: "A", seg: "PUB"}, sh) === null, "PUB 不参与偏离判断");
  ok(segDeviation({id: "ZZ", seg: "ToB"}, sh) === null, "没有收入明细 → 谈不上偏离");
  ok(segDeviation({id: "A", seg: "ToB"}, sh).indexOf("10.0%") > 0, "提示里带具体占比，不只说「偏离」");

  P("=== 8. 编号生成不撞号 ===");
  DB.projects = [{id: "P000", pub: 1}, {id: "P01"}, {id: "P02"}, {id: "P06"}];
  ok(projNextId() === "P07", "最大 P06 → P07");
  DB.projects = [{id: "P000", pub: 1}, {id: "P09"}];
  ok(projNextId() === "P10", "最大 P09 → P10（跨两位数不退回 P02）");
  DB.projects = [{id: "P000", pub: 1}];
  ok(projNextId() === "P01", "只有公共项目 → P01");
  DB.projects = [];
  ok(projNextId() === "P01", "空库 → P01");
  DB.projects = [{id: "P000", pub: 1}, {id: "P01"}, {id: "P03"}, {id: "P04"}, {id: "P05"}];
  ok(projNextId() === "P06", "中间缺号（无 P02）→ 仍取最大 +1 = P06，不复用空号");

  DB.projects = bakP; DB.facts = bakF;
  _projDataCache = null;

  P("=== 9. 迁移幂等：每次打开都会重跑 unpackDB ===");
  const o3 = unpackDB({
    projects: [{id: "P01"}, {id: "P02"}],
    facts: [
      ["2026-01-31", "P01", "R02.04", 10, 0], ["2026-01-31", "P01", "R02.03", 90, 0],
      ["2026-01-31", "P02", "R02.04", 90, 0], ["2026-01-31", "P02", "R02.03", 10, 0]
    ]
  });
  const seg1 = o3.projects.map(p => p.seg).join(",");
  ok(seg1 === "ToC,ToB", "首次迁移 P01=ToC、P02=ToB（" + seg1 + "）");
  const seg2 = unpackDB(o3).projects.map(p => p.seg).join(",");
  ok(seg1 === seg2, "二次 unpack 不改写已落库的 seg");
  /* 这是整套设计的核心语义：结构只补空，不覆盖人工 */
  o3.projects[0].seg = "ToB";
  ok(unpackDB(o3).projects[0].seg === "ToB",
     "人工把 P01 改成 ToB 后重开仍是 ToB（结构不能反向覆盖人工设定）");
})();
