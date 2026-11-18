const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  S.year = 2026; S.project = "ALL";
  const projs = projSet();
  const cellsOf = r => r.split(/<td[^>]*>/).slice(1)
    .map(c => c.split("</td>")[0].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
  const num = s => { const m = String(s).match(/-?[\d,]+\.?\d*/); return m ? +m[0].replace(/,/g, "") : null; };

  /* 从渲染结果里取某月的整段 HTML（月行 + 周行）。
     注意：属性引号用正则兼容 —— 浏览器序列化 innerHTML 时会把单引号统一成双引号 */
  function treeSeg(ym) {
    treeOpen.add(ym);
    renderTimeTree();
    const html = (document.getElementById("tree") || {}).innerHTML || "";
    return (html.split(new RegExp("data-ym=[\"']" + ym + "[\"']"))[1] || "").split(/data-ym=/)[0];
  }
  function weekRows(ym) {
    const seg = treeSeg(ym);
    return seg.split("<tr").filter(s => s.indexOf("class='w'") >= 0 || s.indexOf('class="w"') >= 0).map(r => {
      const c = cellsOf(r);
      return {label: c[0] || "", rev: num(c[2]), pro: num(c[7]), margin: c[12] || "", cells: c};
    });
  }
  const sumOf = (rows, k) => rows.filter(r => r[k] !== null).reduce((a, r) => a + r[k], 0);

  /* 行 → 窗口的映射：W1..W4 各 7 天，余 29–月末；未完周截到 last */
  function windows(ym, n) {
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7), dim = daysInMonth(y, m);
    const last = latestDate();
    const out = [];
    for (let i = 0; i < n; i++) {
      const s = i < 4 ? 1 + i * 7 : 29;
      let e = i < 4 ? Math.min(s + 6, dim) : dim;
      let to = ym + "-" + pad(e);
      if (to > last && ym + "-01" <= last) to = last;
      out.push({from: ym + "-" + pad(s), to: to});
    }
    return out;
  }
  /* 逐行对精确值：每格只允许 1 位小数的舍入误差（±0.05），避免 5 行误差累积掩盖真问题 */
  function checkRows(ym, rows) {
    const usable = rows.filter(r => r.rev !== null);
    const wins = windows(ym, usable.length);
    let exactRev = 0, exactPro = 0, bad = [];
    usable.forEach((r, i) => {
      const a = derive(aggregate(wins[i].from, wins[i].to, projs).acc);
      exactRev += a.rev; exactPro += a.profit;
      if (Math.abs(r.rev - a.rev / 10000) > 0.051) bad.push(r.label.trim() + " 营收 " + r.rev + " vs " + (a.rev / 10000).toFixed(2));
      if (Math.abs(r.pro - a.profit / 10000) > 0.051) bad.push(r.label.trim() + " 利润 " + r.pro + " vs " + (a.profit / 10000).toFixed(2));
    });
    const ma = monthActual(ym, projs);
    return {usable, bad, dR: exactRev - ma.rev, dP: exactPro - ma.profit};
  }

  P("=== 1. 过去月：四周 + 余日 = 整月（精确可加）===");
  const past = ["2026-06", "2026-09", "2026-10"];
  past.forEach(ym => {
    const rows = weekRows(ym);
    const c = checkRows(ym, rows);
    ok(c.usable.length >= 4, ym + " 拆出 " + c.usable.length + " 段（含余日）");
    ok(c.bad.length === 0, ym + " 每行都等于该窗口精确值" + (c.bad.length ? "：" + c.bad[0] : ""));
    ok(Math.abs(c.dR) < 1 && Math.abs(c.dP) < 1,
       ym + " 窗口之和 = 月度：营收差 " + c.dR.toFixed(2) + " 元 / 利润差 " + c.dP.toFixed(2) + " 元");
  });

  P("=== 2. 当月未完：周之和也必须等于「实到日」的月度 ===");
  const curYm = latestDate().slice(0, 7);
  const rows = weekRows(curYm);
  const cc = checkRows(curYm, rows);
  P("  " + curYm + " 周行 " + cc.usable.length + " 段，窗口之和 营收 " + (cc.dR / 10000).toFixed(2) +
    " 万 vs 月度，利润差 " + (cc.dP / 10000).toFixed(3) + " 万");
  ok(cc.bad.length === 0, "当月每行都等于其窗口的精确值" + (cc.bad.length ? "：" + cc.bad[0] : ""));
  ok(Math.abs(cc.dP) < 1, "当月利润可加，差 " + cc.dP.toFixed(2) + " 元（修复前 11 月差 2.3 万）");

  P("=== 3. 未完周只算到「已录最后一天」 ===");
  const last = latestDate();
  const seg = rows.filter(r => r.label.indexOf("未完") >= 0);
  if (seg.length) {
    const w = seg[0];
    const from = curYm + "-" + pad(1 + (rows.indexOf(w)) * 7);
    /* 用同一口径手算：从该周起始日到 last */
    const m = curYm.match(/(\d{4})-(\d{2})/);
    const wIdx = rows.indexOf(w) + 1;
    const s = 1 + (wIdx - 1) * 7, e = s + 6;
    const fromD = curYm + "-" + pad(s);
    const clip = aggregate(fromD, last, projs);
    const full = aggregate(fromD, curYm + "-" + pad(e), projs);
    ok(Math.abs(w.pro - derive(clip.acc).profit / 10000) < 0.15,
       "未完周 " + w.label.trim() + " 利润 = 截到 " + last + " 的值 " + (derive(clip.acc).profit / 10000).toFixed(2) + " 万");
    ok(Math.abs(derive(full.acc).profit - derive(clip.acc).profit) > 1,
       "若按整周算会差 " + ((derive(full.acc).profit - derive(clip.acc).profit) / 10000).toFixed(2) + " 万（所以必须截断）");
  } else {
    ok(true, "本月没有「未完」周（数据已满周），跳过");
  }

  P("=== 4. 空置口径：周与月同源 ===");
  const spMonth = computeRentSpill(curYm + "-01", last, projs);
  let sumWeekSpill = 0;
  rows.filter(r => r.rev !== null).forEach((r, i) => {
    const s = 1 + i * 7;
    let e = s + 6;
    const dim = daysInMonth(2026, +curYm.slice(5, 7));
    if (e > dim) e = dim;
    const to = (curYm + "-" + pad(e)) > last ? last : curYm + "-" + pad(e);
    sumWeekSpill += computeRentSpill(curYm + "-" + pad(s), to, projs).spill;
  });
  P("  月空置 " + (spMonth.spill / 10000).toFixed(2) + " 万　周空置合计 " + (sumWeekSpill / 10000).toFixed(2) + " 万");
  ok(Math.abs(sumWeekSpill - spMonth.spill) < 2000, "周空置之和 ≈ 月空置（差 " + ((sumWeekSpill - spMonth.spill) / 10000).toFixed(2) + " 万）");

  P("=== 5. 周视图与时间树同口径、BP 不拆周 ===");
  const rowsW = weekRows(curYm);
  S.type = "W"; S.month = +curYm.slice(5, 7); S.week = 2;
  const pw = period();
  const lastD = latestDate();
  P("  第2周窗口 " + pw.from + "~" + pw.to + "（lastDay " + lastD + "）");
  ok(pw.to === lastD || pw.to === curYm + "-14", "窗口不越过已录日");
  ok(pw.to === lastD ? pw.label.indexOf("截至") >= 0 : true, "截断时标签注明截至：" + pw.label);
  const wPro = periodAgg(pw, projs).d.profit;
  const treeW2 = rowsW.filter(r => r.label.indexOf("W2") === 0)[0];
  ok(Math.abs(wPro / 10000 - treeW2.pro) < 0.051,
     "顶部周利润 " + (wPro / 10000).toFixed(2) + " = 时间树 W2 " + treeW2.pro);

  renderKPI();
  const kh = (_lastHTML["kpis"] || {}).innerHTML || "";
  ok(kh.indexOf("BP 只到月") >= 0, "周视图标注「BP 只到月」");
  ok((kh.match(/BP —/g) || []).length >= 3, "三张金额卡显示 BP —");
  ok(kh.indexOf("周视图不算达成") >= 0, "经营达成率不计");
  ok(kh.indexOf("周视图不折算日历进度") >= 0, "日历进度不计");
  ok(kh.indexOf("BP <b>¥0.0 万") < 0, "不再出现「BP ¥0.0 万」这种假预算");

  S.type = "M"; S.month = 11;
  renderKPI();
  const mh = (_lastHTML["kpis"] || {}).innerHTML || "";
  ok(mh.indexOf("BP 只到月") < 0 && mh.indexOf("BP <b>") >= 0, "月视图仍正常显示 BP 与达成");

  P("=== 6. 周层不出现任何 BP 折算 ===");
  const segCur = treeSeg(curYm);
  const monthHead = segCur.split(/<tr[^>]*class=["']w["']/)[0];
  const headCells = cellsOf(monthHead);
  ok(headCells[5] && headCells[5].indexOf("%") >= 0, "月行的占年BP 仍是百分比：" + headCells[5]);
  ok(headCells[10] && headCells[10].indexOf("%") >= 0, "月行的利润占年BP 仍是百分比：" + headCells[10]);
  const allW = weekRows(curYm);
  const bpCells = allW.map(r => [r.cells[5], r.cells[10]]).flat();
  ok(bpCells.length > 0, "取到周行的占年BP 列（" + bpCells.length + " 格）");
  ok(bpCells.every(v => v === "—"), "周行占年BP 全部为 —：" + bpCells.join(" / "));
  ok(bpCells.every(v => v.indexOf("%") < 0), "周层不再出现 BP 百分比");
  const capTxt = (document.getElementById("treeCap") || {}).textContent || "";
  ok(capTxt.indexOf("BP 只到月维度") >= 0, "表下说明已同步口径");

  P("=== 7. 不影响其他视图 ===");
  let err = 0;
  ["YTD", "MTD", "M", "W"].forEach(t => { S.type = t; S.month = 11; S.week = 2; try { renderAll(); } catch (e) { err++; P("    " + t + " :: " + e.message); } });
  ok(err === 0, "四期间渲染无异常");
})();
