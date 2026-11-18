const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  P("=== 1. 固定科目识别 ===");
  const fa = fixedAccounts();
  ok(fa.length === 11, "固定科目 " + fa.length + " 个：" + fa.map(a => a.m).join(","));
  ok(fa.every(a => a.fixed && a.dir === "C"), "标记与方向正确");

  P("=== 2. 示例数据 11 月（10 天）缺失情况 ===");
  const miss11 = missingFixed(Y + "-11");
  P("  缺失 " + miss11.length + " 项，可沿用 " + miss11.filter(x => x.prev !== null).length + " 项");
  ok(miss11.length === 0, "示例数据 11 月的固定项都已录入（seedDemo 全量生成）");

  P("=== 3. 人为删除 11 月固定项后重新检查 ===");
  const removed = DB.facts.filter(f => f.d.startsWith(Y + "-11") &&
    ["C01.01", "C02.01.01", "C05.01"].indexOf(f.a) >= 0);
  DB.facts = DB.facts.filter(f => !(f.d.startsWith(Y + "-11") &&
    ["C01.01", "C02.01.01", "C05.01"].indexOf(f.a) >= 0));
  _spreadMap = null;
  const miss2 = missingFixed(Y + "-11");
  ok(miss2.length === 15, "缺失 " + miss2.length + " 项（3 科目 × 5 项目）");
  ok(miss2.every(x => x.prev !== null), "全部可从 10 月沿用");
  P("  样例：" + miss2.slice(0, 3).map(x => x.p + "/" + x.a + " 上月 " + x.prev).join(" | "));

  P("=== 4. 执行沿用 ===");
  const items = miss2.filter(x => x.prev !== null);
  const tot = items.reduce((s, x) => s + x.prev, 0);
  const r = carryFixed(Y + "-11", items);
  ok(r.done === 15, "补齐 " + r.done + " 项，合计 USD " + Math.round(r.sum));
  ok(Math.abs(r.sum - tot) < 0.01, "合计与上月一致");

  const nov = DB.facts.filter(f => f.d.startsWith(Y + "-11"));
  const novSum = nov.reduce((s, f) => s + f.v, 0);
  const p01 = DB.facts.filter(f => f.d.startsWith(Y + "-11") && f.p === "P01" && f.a === "C01.01");
  const p01Sum = p01.reduce((s, f) => s + f.v, 0);
  const octP01 = DB.facts.filter(f => f.d.startsWith(Y + "-10") && f.p === "P01" && f.a === "C01.01").reduce((s, f) => s + f.v, 0);
  ok(p01.length === 30, "P01 房租写入 " + p01.length + " 天（11 月 30 天）");
  ok(Math.abs(p01Sum - octP01) < 0.02, "P01 房租本月 " + p01Sum.toFixed(2) + " = 上月 " + octP01.toFixed(2));
  ok(p01.every(f => f.src === "carry"), "来源标记 carry");

  P("=== 5. 补齐后再次检查 ===");
  const miss3 = missingFixed(Y + "-11");
  ok(miss3.length === 0, "已无缺失（" + miss3.length + "）");

  P("=== 6. 2 月天数适配（用 2026-01 的上月做基期）===");
  DB.facts = DB.facts.filter(f => !f.d.startsWith(Y + "-02"));
  const missFeb = missingFixed(Y + "-02");
  const canFeb = missFeb.filter(x => x.prev !== null);
  P("  " + Y + "-02 缺失 " + missFeb.length + " 项，可沿用 " + canFeb.length + " 项（2 月 28 天）");
  ok(canFeb.length === 55, "可沿用 " + canFeb.length + " 项（5 项目 × 11 科目）");
  if (canFeb.length) {
    const r2 = carryFixed(Y + "-02", canFeb);
    const feb = DB.facts.filter(f => f.d.startsWith(Y + "-02") && f.p === canFeb[0].p && f.a === canFeb[0].a);
    const febSum = feb.reduce((s, f) => s + f.v, 0);
    ok(feb.length === 28, "2 月写入 " + feb.length + " 天");
    ok(Math.abs(febSum - canFeb[0].prev) < 0.02, "2 月合计 " + febSum.toFixed(2) + " = 1 月 " + canFeb[0].prev + "（总额不变，天数不同）");
  }

  P("=== 7. renderCarry 渲染 ===");
  let e1 = null;
  try { renderCarry(); e1 = (_lastHTML["carryList"] && _lastHTML["carryList"].innerHTML) || ""; ok(true, "渲染无异常"); }
  catch (e) { ok(false, "渲染异常：" + e.message); }
  P("  内容片段：" + String(e1).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 110));

  P("=== 8. 回归 ===");
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(t => T("renderAll " + t, () => { S.type = t; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("KPI", renderKPI); T("对比", renderCompare); T("租卡", renderRent);
  T("模板", () => buildTemplate(Y, 11));
  T("打包往返", () => { const b = unpackDB(JSON.parse(JSON.stringify(packDB(DB)))); if (b.facts.length !== DB.facts.length) throw new Error("条数"); if (b.facts.filter(f => f.src === "carry").length !== DB.facts.filter(f => f.src === "carry").length) throw new Error("carry 丢失"); });
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
