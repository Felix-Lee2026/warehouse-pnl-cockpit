const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);
const cells = r => r.split(/<td[^>]*>/).slice(1).map(c => c.split("</td>")[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const num = s => parseFloat(String(s).replace(/[, \u2014]/g, "")) || 0;

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; };

  P("=== 1. 结构：5 列，无溢出列 ===");
  reconOpen.clear();
  reset(); renderRecon();
  let h = (_lastHTML["recon"] && _lastHTML["recon"].innerHTML) || "";
  const head = h.split("</thead>")[0];
  ok((head.match(/<th[ >]/g) || []).length === 5, "5 列表头：" +
     head.replace(/<[^>]+>/g, "|").split("|").map(x => x.trim()).filter(x => x).join(" · "));
  ok(head.indexOf("溢出") < 0, "表头不含「溢出」字样");
  ok(head.indexOf("汇率") >= 0, "保留汇率列");
  ok(head.indexOf("（USD）") >= 0 || head.indexOf("（RMB）") >= 0, "列头标注原币单位：" +
     (head.match(/（(USD|RMB)）/) || [""])[0]);

  let rows = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  const lastM = +latestDate().slice(5, 7);
  ok(rows.length === lastM + 1, "渲染到最新数据月（" + lastM + " 个月 + 合计 = " + rows.length + "）");
  const tdCounts = [...new Set(rows.map(r => (r.match(/<td/g) || []).length))];
  ok(tdCounts.length === 1 && tdCounts[0] === 5, "每行 5 格");

  P("=== 2. 折叠态：只有月份行 ===");
  ok(rows.filter(r => r.indexOf("class='mth") >= 0).length === lastM, lastM + " 个可点月份行");
  ok(h.indexOf("class='sub") < 0, "默认不展开子项目");

  P("=== 3. 展开 11 月 ===");
  reconOpen.add(Y + "-11");
  reset(); renderRecon();
  h = (_lastHTML["recon"] && _lastHTML["recon"].innerHTML) || "";
  rows = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  const i11 = rows.findIndex(r => r.indexOf("11 月") >= 0 && r.indexOf("data-ym") >= 0);
  ok(i11 >= 0, "找到 11 月行");
  const bizCount = DB.projects.filter(p => p.status !== "停用" && !p.pub).length;
  const pubCount = DB.projects.filter(p => p.status !== "停用" && p.pub).length;
  const subs = rows.slice(i11 + 1).filter(r => r.indexOf("class='sub") >= 0 && r.indexOf("sum") < 0);
  ok(subs.length === bizCount + pubCount, "展开 " + subs.length + " 个子项目行（" + bizCount + " 业务 + " + pubCount + " 公共）");

  P("=== 4. P000 只有成本、没有收入 ===");
  const pubRow = subs.find(r => r.indexOf("sub pub") >= 0);
  ok(!!pubRow, "存在公共项目行");
  const pc = cells(pubRow);
  ok(pc[1] === "—", "P000 收入列为 —：" + pc[1]);
  ok(num(pc[2]) > 0, "P000 成本 " + pc[2] + "（= 仓租溢出）");
  ok(num(pc[3]) < 0, "P000 利润 " + pc[3] + "（全为负）");
  reset();
  const sNovT = monthSpan(Y + "-11", projSet());
  const sp11 = computeRentSpill(sNovT.from, sNovT.to, true).spill;
  ok(Math.abs(num(pc[2]) - sp11) < 1, "P000 成本 = 原币溢出 " + Math.round(sp11).toLocaleString() + " " + entryCcy());

  P("=== 5. 子项目之和 = 月份行 ===");
  const main = cells(rows[i11]);
  let sr = 0, sc = 0, sp = 0;
  subs.forEach(r => { const c = cells(r); sr += num(c[1]); sc += num(c[2]); sp += num(c[3]); });
  ok(Math.abs(sr - num(main[1])) < 2, "收入 " + Math.round(sr).toLocaleString() + " = " + main[1]);
  ok(Math.abs(sc - num(main[2])) < 2, "成本 " + Math.round(sc).toLocaleString() + " = " + main[2]);
  ok(Math.abs(sp - num(main[3])) < 2, "利润 " + Math.round(sp).toLocaleString() + " = " + main[3]);

  P("=== 6. 业务子项目各自独立 ===");
  const o11 = monthAgg(Y + "-11", projSet(), true);
  ok(Math.abs(num(main[2]) - o11.d.cAll) < 2, "月份行成本 = 全部项目成本 " + Math.round(o11.d.cAll).toLocaleString() + "（原币）");
  const p01 = cells(subs.find(r => r.indexOf("P01") >= 0));
  const o1 = monthAgg(Y + "-11", ["P01"], true);
  ok(Math.abs(num(p01[1]) - o1.d.rev) < 2, "P01 收入 " + p01[1] + " 与单项目聚合同口径");
  ok(num(p01[1]) < num(main[1]), "P01 小于合计");

  P("=== 7. 小计行 ===");
  const sumRow = rows.slice(i11 + 1).find(r => r.indexOf("sum") >= 0);
  ok(!!sumRow, "有子项目小计行");
  ok(Math.abs(num(cells(sumRow)[3]) - num(main[3])) < 2, "小计利润 = 月份行利润");

  P("=== 8. 合计行 = 逐月之和 ===");
  reconOpen.clear();
  reset(); renderRecon();
  h = (_lastHTML["recon"] && _lastHTML["recon"].innerHTML) || "";
  rows = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  const tot = cells(rows[rows.length - 1]);
  let s1 = 0, s2 = 0, s3 = 0;
  for (let m = 1; m <= 11; m++) { const c = cells(rows[m - 1]); s1 += num(c[1]); s2 += num(c[2]); s3 += num(c[3]); }
  ok(Math.abs(num(tot[1]) - s1) < 2, "收入合计 " + tot[1]);
  ok(Math.abs(num(tot[2]) - s2) < 2, "成本合计 " + tot[2]);
  ok(Math.abs(num(tot[3]) - s3) < 2, "利润合计 " + tot[3]);
  ok(Math.abs(num(tot[3]) - periodAgg(period(), projSet(), true).d.profit) < 2, "与原币 periodAgg 一致");

  P("=== 8b. 原币 × 当月汇率 = RMB 口径 ===");
  const rmb = periodAgg(period(), projSet()).d;
  let rawSum = 0;
  for (let m = 1; m <= lastM; m++) rawSum += monthAgg(Y + "-" + pad(m), projSet(), true).d.profit;
  const fxAvg = rmb.profit / rawSum;
  ok(Math.abs(rmb.profit) > Math.abs(num(tot[3])) * 3,
     "RMB 利润 " + Math.round(rmb.profit).toLocaleString() + " 约为原币 " + Math.round(num(tot[3])).toLocaleString() + " 的 " + fxAvg.toFixed(2) + " 倍");
  ok(fxAvg > 6.5 && fxAvg < 7.5, "倍数落在汇率区间（" + fxAvg.toFixed(3) + "）");

  P("=== 9. 只渲染到最新数据月，未来月份不出现 ===");
  ok(h.indexOf((lastM + 1) + " 月") < 0 || lastM === 12, "不显示 " + (lastM + 1) + " 月及以后");
  const futureYm = Y + "-" + pad(Math.min(12, lastM + 1));
  reconOpen.add(futureYm);
  reset(); renderRecon();
  h = (_lastHTML["recon"] && _lastHTML["recon"].innerHTML) || "";
  ok(h.indexOf(futureYm) < 0, "未来月份 " + futureYm + " 整行都不渲染");
  reconOpen.clear();

  P("=== 10. 回归 ===");
  reset();
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(ty => T("renderAll " + ty, () => { S.type = ty; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("核对台", renderCheck); T("缺口", renderGap); T("对比", renderCompare);
  T("人效", renderUnit); T("趋势", renderTrend); T("阶梯", renderLadder); T("录入台", renderEntry);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
