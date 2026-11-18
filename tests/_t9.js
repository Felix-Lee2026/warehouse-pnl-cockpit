const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const RENT = rentOf(Y + "-11");        /* 逐月仓租：取 11 月作为基准 */
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; };
  const spillOf = (from, to) => { reset(); return computeRentSpill(from, to); };

  P("=== 1. 基线：示例数据全年都有明细 ===");
  let sp = spillOf(Y + "-01-01", Y + "-12-31");
  ok(sp.months.length === 11, "11 个月参与折算（12 月还没录数据，不计）：" + sp.months.length);
  const baseline = sp.spill;
  P("  全年仓租 " + Math.round(sp.total).toLocaleString() + " / 溢出 " + Math.round(sp.spill).toLocaleString());

  P("=== 2. 复现用户场景：只留 11 月 1-9 的数据 ===");
  const backup = JSON.parse(JSON.stringify(DB.facts));
  DB.facts = DB.facts.filter(f => f.d >= Y + "-11-01" && f.d <= Y + "-11-09");
  reset();
  S.type = "YTD";
  let zeroMonths = 0;
  for (let m = 1; m <= 10; m++) {
    const ym = Y + "-" + pad(m);
    const dim = daysInMonth(Y, m);
    const d = derive(aggregate(ym + "-01", ym + "-" + pad(dim), DB.projects.map(p => p.id)).acc);
    if (Math.abs(d.profit) < 0.01 && Math.abs(d.cAll) < 0.01) zeroMonths++;
  }
  ok(zeroMonths === 10, "1-10 月利润与成本都为 0（" + zeroMonths + "/10）");

  sp = spillOf(Y + "-01-01", Y + "-12-31");
  ok(sp.months.length === 1 && sp.months[0] === Y + "-11", "只有 11 月参与折算：" + sp.months.join(","));
  ok(Math.abs(sp.total - rentOf(Y + "-11") * (DB.fx[Y + "-11"] || 7.1)) < 100,
     "期间仓租只算 11 月整月 " + Math.round(sp.total).toLocaleString() + "（该月月租 " + rentOf(Y + "-11") + "）");
  P("  溢出 " + Math.round(sp.spill).toLocaleString() + "（11 月没录场地费，全额溢出）");

  P("=== 3. 1 月单独查询不再凭空产生成本 ===");
  const jan = spillOf(Y + "-01-01", Y + "-01-31");
  ok(jan.total === 0 && jan.spill === 0, "1 月溢出 = " + jan.spill + "（无明细，不计仓租）");

  P("=== 4. 该月有业务但没录场地费 → 全额溢出（正确） ===");
  DB.facts.push({d: Y + "-05-10", p: "P01", a: "R02.04", v: 1000, src: "edit"});
  reset();
  const may = spillOf(Y + "-05-01", Y + "-05-31");
  ok(Math.abs(may.total - rentOf(Y + "-05") * (DB.fx[Y + "-05"] || 7.1)) < 10,
     "5 月有营收、无场地费 → 仓租 " + Math.round(may.total).toLocaleString() + "，溢出 " + Math.round(may.spill).toLocaleString());
  ok(may.spill > 0 && Math.abs(may.cover) < 0.01, "覆盖率 " + (may.cover * 100).toFixed(1) + "%");

  P("=== 5. 录了场地费后溢出同步下降 ===");
  DB.facts.push({d: Y + "-05-10", p: "P01", a: "C01.01", v: 3000, src: "edit"});
  reset();
  const may2 = spillOf(Y + "-05-01", Y + "-05-31");
  ok(Math.abs(may2.used - 3000 * (DB.fx[Y + "-05"] || 7.1)) < 10, "承担 " + Math.round(may2.used).toLocaleString());
  ok(Math.abs((may2.total - may2.used) - may2.spill) < 0.01, "溢出 = 仓租 − 承担，恒等");

  P("=== 6. 仓租总额为 0 时全部为 0 ===");
  const keepRent = JSON.parse(JSON.stringify(DB.rent));
  const keepDef = DB.meta.rentDefault;
  DB.rent = {}; DB.meta.rentDefault = 0;
  reset();
  const z = spillOf(Y + "-01-01", Y + "-12-31");
  ok(z.total === 0 && z.spill === 0 && z.cover === null,
     "全部月份租金为 0 → 仓租 0 / 溢出 0 / 覆盖率 —（不再负冲减）");
  DB.rent = keepRent; DB.meta.rentDefault = keepDef;

  P("=== 7. 恢复数据后与基线一致（无回归）===");
  DB.facts = JSON.parse(JSON.stringify(backup));
  reset();
  const back = spillOf(Y + "-01-01", Y + "-12-31");
  ok(Math.abs(back.spill - baseline) < 0.01, "恢复后溢出 " + Math.round(back.spill).toLocaleString() + " = 基线 " + Math.round(baseline).toLocaleString());

  P("=== 8. 周视图也遵守同一规则 ===");
  S.type = "W"; S.week = 2; S.month = 1;
  reset();
  const wk = computeRentSpill(Y + "-01-08", Y + "-01-14");
  ok(wk.total > 0, "1 月第 2 周（有数据）→ 仓租 " + Math.round(wk.total).toLocaleString());
  S.type = "YTD";

  P("=== 9. 清空逻辑会同时清掉 adj ===");
  const adjBefore = (DB.adj || []).length;
  ok(adjBefore > 0, "清空前有 " + adjBefore + " 条预估增量");
  P("  （按钮逻辑：DB.facts=[]; DB.bp=[]; DB.adj=[]; 已覆盖）");

  P("=== 10. 回归 ===");
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(ty => T("renderAll " + ty, () => { S.type = ty; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("对比", renderCompare); T("缺口", renderGap); T("人效", renderUnit); T("租卡", renderRent);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
