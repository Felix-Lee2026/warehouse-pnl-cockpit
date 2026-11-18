const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

/* 业务量指标（Q 系列）可增可改。
   关键区分：
   · Q01–Q03 是「系统指标」—— Q01 入库柜 / Q02 库存立方 / Q03 出库单，
     单均、人效、库容利用率都直接取这三个编码，所以不能删
   · 新增的 Q04+ 是「自建指标」—— 只进 qty，只做记录和展示，不参与固定算法
   两者都要能改名称、改单位（单位只影响文案，不影响计算） */

(async () => {
  await init();
  const bakAcc = JSON.parse(JSON.stringify(DB.accounts));
  const bakFacts = DB.facts;
  const reset = () => { mCache = {}; _spillCache = {}; _spreadMap = null; _lastDayCache = {}; _projDataCache = null; };
  const idx = m => DB.accounts.findIndex(a => a.m === m);
  const nAcc = () => DB.accounts.length;

  P("=== 1. 新增业务量指标：编码接在 Q 组之后 ===");
  const n0 = nAcc();
  addQtyAccount();
  ok(nAcc() === n0 + 1, "科目数 +1");
  const q4 = DB.accounts.find(a => a.m === "Q04");
  ok(!!q4, "生成 Q04");
  ok(q4 && q4.dir === "Q", "方向是数量");
  ok(q4 && q4.custom === 1, "标记为自建");
  ok(q4 && q4.u === "项", "默认单位「项」（可改）");
  ok(q4 && q4.lvl === 0, "层级 0，跟 Q01–Q03 同级");

  P("=== 2. 位置：紧跟 Q03，在收入科目之前 ===");
  ok(idx("Q04") === idx("Q03") + 1, "Q04 紧跟在 Q03 之后");
  ok(idx("Q04") < idx("R"), "排在收入科目之前");

  P("=== 3. 再加一个：Q05，序号不重复 ===");
  addQtyAccount();
  ok(!!DB.accounts.find(a => a.m === "Q05"), "生成 Q05");
  ok(DB.accounts.filter(a => a.dir === "Q").length === 5, "业务量指标共 5 个");

  P("=== 4. 改名称 / 改单位 ===");
  const i4 = idx("Q04");
  DB.accounts[i4].n = "托盘数";
  DB.accounts[i4].u = "托";
  buildMap();
  ok(ACMap["Q04"].n === "托盘数" && ACMap["Q04"].u === "托", "名称和单位都改了");
  ok(ACMap["Q04"].m === "Q04", "编码不变");

  P("=== 5. 自建指标进 qty、不进金额 ===");
  DB.facts = [
    {d: "2026-05-10", p: "P01", a: "Q04", v: 120, src: "edit"},
    {d: "2026-05-10", p: "P01", a: "R02.04", v: 1000, src: "edit"}
  ];
  reset();
  const ag = aggregate("2026-05-01", "2026-05-31", ["P01"]);
  ok(ag.qty["Q04"] === 120, "Q04 数量进了 qty（" + ag.qty["Q04"] + "）");
  ok(!ag.acc["Q04"], "Q04 没有进金额账");
  const d5 = derive(ag.acc);
  ok(Math.abs(d5.rev - 1000 * rateOf("2026-05")) < 1, "营收只算 R02.04，没被 Q04 污染");

  P("=== 6. 系统指标 Q02 仍然驱动库容指标 ===");
  DB.facts = [{d: "2026-05-31", p: "P01", a: "Q02", v: 500, src: "edit"}];
  reset();
  const cbm = latestQty("2026-05-01", "2026-05-31", "Q02", ["P01"]);
  ok(cbm === 500, "latestQty(Q02) = 500，新增 Q04/Q05 不影响它");

  P("=== 7. 删除拦截 ===");
  const b7 = nAcc();
  DB.facts = [{d: "2026-05-10", p: "P01", a: "Q04", v: 120, src: "edit"}];
  reset();
  delSubAccount(idx("Q04"));                       /* 有明细 */
  ok(nAcc() === b7, "Q04 有明细 → 不删");
  delSubAccount(idx("Q02"));                       /* 系统指标 */
  ok(nAcc() === b7, "Q02 是系统指标 → 永不删");
  DB.facts = bakFacts; reset();
  delSubAccount(idx("Q05"));                       /* 无明细的自建指标 */
  ok(!DB.accounts.find(a => a.m === "Q05"), "Q05 无明细 → 删掉了");
  delSubAccount(idx("Q04"));
  ok(!DB.accounts.find(a => a.m === "Q04"), "Q04 清掉明细后 → 删掉了");

  P("=== 8. 单位改动不触发任何计算 ===");
  const i2 = idx("Q02");
  const oldU = DB.accounts[i2].u;
  const before = periodAgg(period(), ["P01"]).d;
  DB.accounts[i2].u = "m³"; buildMap(); reset();
  const after = periodAgg(period(), ["P01"]).d;
  ok(Math.abs(before.rev - after.rev) < 0.01 && Math.abs(before.profit - after.profit) < 0.01,
     "改 Q02 单位后营收/利润一分不变");
  DB.accounts[i2].u = oldU; buildMap(); reset();

  P("=== 9. 恢复 ===");
  DB.accounts = bakAcc; DB.facts = bakFacts; buildMap(); reset();
  ok(nAcc() === bakAcc.length, "科目表复原（" + nAcc() + " 个）");
  ok(DB.accounts.filter(a => a.dir === "Q").length === 3, "业务量指标回到 3 个");
})();
