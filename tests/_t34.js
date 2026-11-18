const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

/* 总览页两张图底部的达成率行。
   核心不是"有没有显示"，而是「算法有没有和时间进度树一致」——
   亏损预算下用 实际÷BP 会把「多亏」算成「超额完成」，方向直接反过来。 */

(async () => {
  await init();
  const Y = new Date().getFullYear();
  const CM = new Date().getMonth() + 1;          /* 当前月：可能未过完 */
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; _projDataCache = null; };

  const html = id => (_lastHTML[id] && _lastHTML[id].innerHTML) || "";
  /* 达成率标签：font-size 9，深灰=有值 / 浅灰=— */
  const rates = s => {
    const out = [];
    const re = /<text[^>]*font-size="9"[^>]*fill="(#5b6470|#c9d0d8)"[^>]*>([^<]*)<\/text>/g;
    let m;
    while ((m = re.exec(s))) out.push({v: m[2], dashed: m[1] === "#c9d0d8"});
    return out;
  };

  P("=== 1. 两张图都出达成率行、各 12 格 ===");
  reset(); renderTrend(); renderTrendProfit();
  const t1 = html("trend"), t2 = html("trendPro");
  const r1 = rates(t1), r2 = rates(t2);
  ok(r1.length === 12, "营收图达成率 12 格（" + r1.length + "）");
  ok(r2.length === 12, "利润图达成率 12 格（" + r2.length + "）");
  ok(t1.indexOf("柱下为达成率") >= 0 && t2.indexOf("柱下为达成率") >= 0, "两图图例都注明「柱下为达成率」");
  ok(t1.indexOf("当月未过完") >= 0, "说明 * 的含义");

  P("=== 2. 数值必须等于 achRate（与时间进度树同一函数）===");
  const bpOf = m => (DB.bp.find(b => b.ym === Y + "-" + pad(m)) || {});
  let match = 0, checked = 0;
  for (let m = 1; m <= 12; m++) {
    const ym = Y + "-" + pad(m);
    if (!monthHasFacts(ym, projSet())) continue;
    const bp = bpOf(m);
    if (!bp.rev) continue;
    const a = monthAgg(ym, projSet());
    const exp = (achRate(a.d.rev, bp.rev) * 100).toFixed(1) + "%";
    checked++;
    if (r1[m - 1].v.replace("*", "") === exp) match++;
    else P("    " + m + " 月不符：显示 " + r1[m - 1].v + "，手算 " + exp);
  }
  ok(checked > 0 && match === checked, "营收图 " + match + "/" + checked + " 个月与 achRate 完全一致");

  P("=== 3. 无实际数据的月份显示 — ===");
  const emptyM = [];
  for (let m = 1; m <= 12; m++) if (!monthHasFacts(Y + "-" + pad(m), projSet())) emptyM.push(m);
  P("  无明细月份：" + (emptyM.length ? emptyM.join(",") : "无"));
  ok(emptyM.every(m => r1[m - 1].v === "—" && r1[m - 1].dashed), "空月显示灰色「—」（" + emptyM.join(",") + "）");
  ok(emptyM.every(m => r2[m - 1].v === "—"), "利润图同样");

  P("=== 4. 当月未过完 → 带 * ===");
  const curYm = Y + "-" + pad(CM);
  const curDim = daysInMonth(Y, CM);
  const curLast = lastDayOf(curYm);
  if (curLast > 0 && curLast < curDim) {
    ok(r1[CM - 1].v.indexOf("*") >= 0, CM + " 月未过完（录到 " + curLast + "/" + curDim + "），营收达成率带 *：" + r1[CM - 1].v);
    ok(r2[CM - 1].v.indexOf("*") >= 0, "利润达成率也带 *");
  } else {
    P("  " + CM + " 月已录满（" + curLast + "/" + curDim + "），跳过 * 断言");
  }
  /* 未过完的月份不能是「—」——它是有数据的，只是不完整 */
  ok(!(curLast > 0 && r1[CM - 1].v === "—"), "未过完月仍给出数值（不是 —）");

  P("=== 5. 亏损预算下方向不能反（这是最容易错的地方）===");
  const bf = DB.facts.slice(), bpBak = JSON.parse(JSON.stringify(DB.bp));
  const bm = {entryCcy: DB.meta.entryCcy, rd: DB.meta.rentDefault, rt: DB.meta.rentTotal};
  DB.meta.entryCcy = "RMB"; DB.meta.rentDefault = 0; DB.meta.rentTotal = 0;
  DB.rent = {}; DB.adj = [];
  /* 1 月：实际亏 31.2 万，BP 亏 15.8 万 → 严重超亏，达成率应约 2.5%
     2 月：实际亏 31.2 万，BP 亏 37.0 万 → 少亏 5.8 万，达成率应约 115.7% */
  DB.facts = [
    {d: Y + "-01-01", p: "P01", a: "C04.01", v: 312000, src: "edit"},
    {d: Y + "-02-01", p: "P01", a: "C04.01", v: 312000, src: "edit"}
  ];
  DB.bp = [
    {ym: Y + "-01", rev: 0, profit: -158000},
    {ym: Y + "-02", rev: 0, profit: -370000}
  ];
  reset(); renderTrendProfit();
  const t3 = html("trendPro");
  const r3 = rates(t3);
  P("  1 月达成率 " + r3[0].v + "（应 2.5%）｜2 月 " + r3[1].v + "（应 115.7%）");
  ok(r3[0].v === "2.5%", "超亏月达成率 2.5%，不是 197.5%");
  ok(r3[1].v === "115.7%", "少亏月达成率 115.7%，不是 84.3%");
  ok(t3.indexOf("197.5%") < 0, "图里没有「多亏反而超额完成」的 197.5%");

  P("=== 6. 没有 BP 时不出达成率行（省掉一底空白）===");
  DB.facts = bf; DB.bp = []; DB.rent = {};
  DB.meta.entryCcy = bm.entryCcy; DB.meta.rentDefault = bm.rd; DB.meta.rentTotal = bm.rt;
  reset(); renderTrend(); renderTrendProfit();
  const t4 = html("trend"), t5 = html("trendPro");
  ok(rates(t4).length === 0 && rates(t5).length === 0, "无 BP 时不画达成率行");
  const vbOf = s => (s.match(/viewBox="([^"]+)"/) || [])[1];
  ok(vbOf(t4) === vbOf(t5), "两图 viewBox 仍一致：" + vbOf(t4));
  ok(vbOf(t4).indexOf(" 232") > 0, "无 BP 时高度回到 232（不浪费底边距）");

  P("=== 7. 有 BP 时两图等高、且比无 BP 时高一行 ===");
  DB.bp = bpBak;
  reset(); renderTrend(); renderTrendProfit();
  const t6 = html("trend"), t7 = html("trendPro");
  ok(vbOf(t6) === vbOf(t7), "有 BP 时两图 viewBox 一致：" + vbOf(t6));
  ok(vbOf(t6).indexOf(" 250") > 0, "高度 250（底部多 18 给达成率）");
  ok(rates(t6).length === 12 && rates(t7).length === 12, "两图各有 12 格达成率");

  P("=== 8. 切单项目：BP 不显示，达成率也不显示 ===");
  S.project = "P01"; reset(); renderTrend(); renderTrendProfit();
  const t8 = html("trend"), t9 = html("trendPro");
  ok(rates(t8).length === 0 && rates(t9).length === 0, "单项目视角无达成率（BP 是仓级预算）");
  /* 文案在 #trendCap 里，不在 #trend 的 innerHTML 里 —— 上一版断言查错了对象 */
  const cap8 = ((_lastHTML["trendCap"] || {}).textContent) || "";
  ok(cap8.indexOf("切到「全部项目」才显示") >= 0, "图注说明原因：" + cap8.slice(0, 50));
  S.project = "ALL";

  P("--- 完成 ---");
})().catch(e => {
  P("  FAIL 未捕获异常（后续断言未执行）：" + e.message);
});
