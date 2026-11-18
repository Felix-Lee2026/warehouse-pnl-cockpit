const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

/* 科目主数据可编辑：改名 / 加子科目 / 删子科目 / 切币种。
   三条硬约束：
   ① 编码一旦生成就不再改 —— 明细是按编码挂账的，改编码等于断账
   ② 新科目必须真的进得了汇总 —— derive 认的是 ACMap，不是 calc 标记
   ③ 有明细、有子科目的不许删（否则账对不上） */

(async () => {
  await init();
  const bakAcc = JSON.parse(JSON.stringify(DB.accounts));
  const bakFacts = DB.facts;
  const reset = () => { mCache = {}; _spillCache = {}; _spreadMap = null; _lastDayCache = {}; _projDataCache = null; };
  const idx = m => DB.accounts.findIndex(a => a.m === m);
  const nAcc = () => DB.accounts.length;

  P("=== 1. 改名：ACMap 跟着变，编码不动 ===");
  const i1 = idx("C03.02");
  const oldName = DB.accounts[i1].n;
  DB.accounts[i1].n = "包材-纸箱";
  buildMap();
  ok(ACMap["C03.02"].n === "包材-纸箱", "ACMap 里名称已更新");
  ok(DB.accounts[i1].m === "C03.02", "编码没变（明细还挂得住）");
  DB.accounts[i1].n = oldName; buildMap();

  P("=== 2. 加子科目：编码 / 层级 / 继承 ===");
  const n0 = nAcc();
  addSubAccount(idx("C03.02"));
  ok(nAcc() === n0 + 1, "科目数 +1");
  const c1 = DB.accounts.find(a => a.m === "C03.02.01");
  ok(!!c1, "生成编码 C03.02.01");
  ok(c1 && c1.lvl === 3, "层级 = 父 + 1（" + (c1 && c1.lvl) + "）");
  ok(c1 && c1.dir === "C", "方向继承父级（成本）");
  ok(c1 && c1.beh === ACMap["C03.02"].beh, "性态继承父级（" + (c1 && c1.beh) + "）");
  ok(c1 && c1.custom === 1, "标记为自建科目");

  P("=== 3. 再加一个：序号递增不重复 ===");
  addSubAccount(idx("C03.02"));
  ok(!!DB.accounts.find(a => a.m === "C03.02.02"), "第二个是 C03.02.02");
  ok(DB.accounts.filter(a => a.m.indexOf("C03.02.") === 0).length === 2, "父级下共 2 个子科目");

  P("=== 4. 插入位置：紧跟父级子树 ===");
  ok(idx("C03.02.01") === idx("C03.02") + 1, "子科目紧跟在父科目之后");

  P("=== 5. 不能加的地方 ===");
  const b5 = nAcc();
  addSubAccount(idx("Q02"));
  addSubAccount(idx("C08"));
  ok(nAcc() === b5, "业务量科目、自动推导科目都拒绝加子科目");

  P("=== 6. 新科目真的进汇总 ===");
  const nm = "C03.02.01";
  DB.facts = [{d: "2026-03-15", p: "P01", a: nm, v: 1000, src: "edit"}];
  reset();
  const d1 = derive(aggregate("2026-03-01", "2026-03-31", ["P01"]).acc);
  ok(d1.cAll > 0, "新科目金额进了总成本（" + d1.cAll.toFixed(0) + "）");
  ok(!!ACMap[nm], "ACMap 里有这个科目");
  ok(d1[ACMap[nm].beh === "F" ? "cF" : ACMap[nm].beh === "V" ? "cV" : "cS"] > 0,
     "按性态归到 " + ACMap[nm].beh + " 类");
  DB.facts = bakFacts; reset();

  P("=== 7. 删除拦截：有明细 / 有子科目 ===");
  const b7 = nAcc();
  DB.facts = [{d: "2026-03-15", p: "P01", a: "C03.02.01", v: 1000, src: "edit"}];
  delSubAccount(idx("C03.02.01"));
  ok(nAcc() === b7, "有明细 → 不删");
  DB.facts = bakFacts;
  delSubAccount(idx("C03.02"));
  ok(nAcc() === b7, "有子科目 → 不删");

  P("=== 8. 删除：无数据无子科目才放行 ===");
  delSubAccount(idx("C03.02.02"));
  ok(!DB.accounts.find(a => a.m === "C03.02.02"), "C03.02.02 已删");
  delSubAccount(idx("C03.02.01"));
  ok(!DB.accounts.find(a => a.m === "C03.02.01"), "C03.02.01 已删");

  P("=== 9. 默认科目永不删 ===");
  const b9 = nAcc();
  delSubAccount(idx("C03.01"));
  delSubAccount(idx("C02.01.01"));
  ok(nAcc() === b9, "非自建科目一律删不掉");

  P("=== 10. 深层加子科目（lvl3 → lvl4），并挡住第 5 层 ===");
  addSubAccount(idx("C02.01.01"));
  const c4 = DB.accounts.find(a => a.m === "C02.01.01.01");
  ok(!!c4 && c4.lvl === 4, "lvl3 下能加出 lvl4");
  const b10 = nAcc();
  if (c4) addSubAccount(idx(c4.m));
  ok(nAcc() === b10, "lvl4 不能再往下加（上限 4 层）");
  delSubAccount(idx("C02.01.01.01"));

  P("=== 11. 顶层（R / C）加子科目：编码不带点，跟现有体系一致 ===");
  addSubAccount(idx("R"));
  const r3 = DB.accounts.find(a => a.m === "R03");
  ok(!!r3, "R 下生成 R03（不是 R.03）");
  ok(r3 && r3.lvl === 1, "层级 = 1（" + (r3 && r3.lvl) + "）");
  ok(!DB.accounts.find(a => a.m === "R.03"), "没有造出 R.03 这种不合体系的编码");
  addSubAccount(idx("C"));
  ok(!!DB.accounts.find(a => a.m === "C09"), "C 下生成 C09（接在 C01–C08 之后）");
  delSubAccount(idx("R03"));
  delSubAccount(idx("C09"));
  ok(!DB.accounts.find(a => a.m === "R03") && !DB.accounts.find(a => a.m === "C09"), "顶层自建科目可删");

  P("=== 12. 币种：全局口径，切了之后折算方式跟着变 ===");
  const oldCcy = entryCcy();
  const f1 = {d: "2026-06-15", p: "P01", a: "C03.01", v: 1000, src: "edit"};
  const r1 = fxToRMB(f1.v, "2026-06");
  ok(Math.abs(r1 - 1000 * rateOf("2026-06")) < 0.01, "USD 口径下按汇率折算（" + r1.toFixed(0) + "）");
  DB.meta.entryCcy = "RMB";
  const r2 = fxToRMB(f1.v, "2026-06");
  ok(r2 === 1000, "RMB 口径下不折算（" + r2 + "）");
  DB.meta.entryCcy = oldCcy;
  ok(fxToRMB(1000, "2026-06") === r1, "切回来数值一致，没有累积误差");

  P("=== 13. 恢复 ===");
  DB.accounts = bakAcc; DB.facts = bakFacts; buildMap(); reset();
  ok(nAcc() === bakAcc.length, "科目表复原（" + nAcc() + " 个）");
  ok(!DB.accounts.some(a => a.m.indexOf("C03.02.") === 0), "自建科目已清空");
})();
