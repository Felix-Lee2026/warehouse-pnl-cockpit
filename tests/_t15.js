const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);
const cells = r => r.split(/<td[^>]*>/).slice(1).map(c => c.split("</td>")[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

(async () => {
  await init();
  const T = new Date(), Y = T.getFullYear(), CM = T.getMonth() + 1;
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; };

  const bf = JSON.parse(JSON.stringify(DB.facts));
  const br = JSON.parse(JSON.stringify(DB.rent));
  const bb = JSON.parse(JSON.stringify(DB.bp));
  const ba = JSON.parse(JSON.stringify(DB.adj || []));

  /* 造场景：1 月整月数据全记在 1 号（月合计导入的典型形态）；当月只录到 10 号 */
  DB.facts = [];
  DB.rent = {};
  DB.bp = [];
  DB.adj = [];
  DB.facts.push({d: Y + "-01-01", p: "P01", a: "R02.01", v: 10000, src: "import"});
  DB.facts.push({d: Y + "-01-01", p: "P01", a: "C01.01", v: 2000, src: "import"});
  DB.facts.push({d: Y + "-01-01", p: "P01", a: "C02.01.01", v: 1000, src: "import"});
  DB.rent[Y + "-01"] = 5000;
  const daysCur = Math.min(T.getDate(), 10);
  for (let d = 1; d <= daysCur; d++) {
    DB.facts.push({d: Y + "-" + pad(CM) + "-" + pad(d), p: "P01", a: "R02.01", v: 1000, src: "import"});
    DB.facts.push({d: Y + "-" + pad(CM) + "-" + pad(d), p: "P01", a: "C01.01", v: 200, src: "import"});
    DB.facts.push({d: Y + "-" + pad(CM) + "-" + pad(d), p: "P01", a: "C02.01.01", v: 100, src: "import"});
  }
  DB.rent[Y + "-" + pad(CM)] = 5000;
  if (CM === 1) { P("  （1 月无法同时构造历史月与当月，跳过）"); }
  reset();

  P("=== 1. 已过月份：整月数据记在 1 号，也必须按整月算 ===");
  if (CM > 1) {
    const sp = monthSpan(Y + "-01", projSet());
    ok(sp.days === 31 && sp.to === Y + "-01-31", "1 月区间 " + sp.from + " ~ " + sp.to + "，天数 " + sp.days);
    const a = monthAgg(Y + "-01", projSet(), true);
    /* 营收 10000 − 明细成本 3000 − 溢出 (5000−2000)=3000 → 利润 4000 */
    ok(Math.abs(a.d.profit - 4000) < 0.5, "1 月利润 " + a.d.profit.toFixed(2) + "（应为 4,000：房租按整月摊）");
    ok(Math.abs((a.acc["C08"] || 0) - 3000) < 0.5, "1 月溢出 " + (a.acc["C08"] || 0).toFixed(2) + "（应为 3,000）");
  }

  P("=== 2. 当月：截到已录最后一天，房租按天摊 ===");
  const spC = monthSpan(Y + "-" + pad(CM), projSet());
  const dimC = new Date(Y, CM, 0).getDate();
  ok(spC.days === daysCur, "当月天数 " + spC.days + "（录到 " + daysCur + " 号）");
  ok(spC.dim === dimC, "当月自然天数 " + spC.dim);
  const aC = monthAgg(Y + "-" + pad(CM), projSet(), true);
  const expSpill = 5000 * (daysCur / dimC) - 200 * daysCur;
  ok(Math.abs((aC.acc["C08"] || 0) - expSpill) < 0.5,
     "当月溢出 " + (aC.acc["C08"] || 0).toFixed(2) + "（应为 " + expSpill.toFixed(2) + " = 月租×" + daysCur + "/" + dimC + " − 已承担）");

  P("=== 3. 时间树当月行 = 实际 ÷ 天数 × 自然天数（灰字给实际） ===");
  renderTimeTree();
  const h = (_lastHTML["tree"] && _lastHTML["tree"].innerHTML) || "";
  const rows = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  const curRow = rows.find(r => r.indexOf(pad(CM) + " 月") >= 0);
  const c = cells(curRow);
  const maRMB = monthAgg(Y + "-" + pad(CM), projSet()).d.profit;
  const fcM = forecastMonth(Y + "-" + pad(CM), projSet());
  const shown = parseFloat(String(c[7]).replace(/,/g, ""));
  ok(Math.abs(shown - fcM.profit / 10000) < 0.06,
     "当月利润格 " + c[7] + " 万 = 外推 " + (fcM.profit / 10000).toFixed(1) + " 万");
  ok(curRow.indexOf("实 " + (Math.abs(maRMB) >= 10000 ? (maRMB / 10000).toFixed(1) : Math.round(maRMB))) >= 0,
     "灰字给出实际发生额：" + (curRow.match(/实 -?[\d.,]+/g) || []).join(" / "));
  ok(curRow.indexOf(daysCur + "/" + dimC) >= 0, "期间列标注已录 " + daysCur + "/" + dimC + " 天");

  P("=== 4. KPI / 阶梯 / 对比 与时间树同口径 ===");
  renderKPI(); renderLadder(); renderCompare();
  const pa = periodAgg(period(), projSet());
  const k = (_lastHTML["kpis"] && _lastHTML["kpis"].innerHTML) || "";
  const kp = (k.match(/总利润<\/div><div class="v">([^<]+)/) || [])[1] || "";
  const fmt = v => (v < 0 ? "-¥" : "¥") + (Math.abs(v) >= 10000 ? (Math.abs(v) / 10000).toFixed(1) + " 万" : Math.round(Math.abs(v)).toLocaleString("zh-CN"));
  ok(kp.indexOf(fmt(pa.d.profit)) >= 0, "KPI 总利润 " + kp + " 与 periodAgg 一致（" + fmt(pa.d.profit) + "）");
  const lad = (_lastHTML["ladder"] && _lastHTML["ladder"].innerHTML) || "";
  ok(lad.indexOf(fmt(pa.d.profit)) >= 0, "阶梯总利润同值");
  const cmp = (_lastHTML["cmp"] && _lastHTML["cmp"].innerHTML) || "";
  ok(cmp.indexOf(fmt(pa.d.profit)) >= 0, "项目对比仓级合计同值");

  P("=== 5. 预测仍是「实际 ÷ 已录天数 × 自然天数」 ===");
  const f = forecastMonth(Y + "-" + pad(CM), projSet());
  const kk = dimC / daysCur;
  ok(Math.abs(f.profit - maRMB * kk) < 1, "预测利润 " + f.profit.toFixed(0) + " = 实际 " + maRMB.toFixed(0) + " × " + kk.toFixed(3));

  P("=== 6. 恢复示例数据后回归 ===");
  DB.facts = bf; DB.rent = br; DB.bp = bb; DB.adj = ba;
  reset();
  let o = 0, fail = [];
  const T2 = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD", "MTD", "M", "W"].forEach(ty => T2("renderAll " + ty, () => { S.type = ty; S.month = CM; S.week = 2; S.project = "ALL"; renderAll(); }));
  T2("拆解", renderRecon); T2("核对台", renderCheck);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f2 => P("    FAIL " + f2));
})();
