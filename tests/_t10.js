const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);
const cells = r => r.split(/<td[^>]*>/).slice(1).map(c => c.split("</td>")[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; };

  P("=== 0. 构造用户的场景：BP 全录，亏损预算，实际全空 ===");
  const backupFacts = JSON.parse(JSON.stringify(DB.facts));
  const backupBp = JSON.parse(JSON.stringify(DB.bp));
  DB.facts = [];
  DB.bp.forEach(b => { b.rev = 1000000; b.profit = -100000; });   // 每月预算亏 10 万
  reset();

  P("=== 1. 没有任何实际数据时，达成率必须为 — ===");
  renderTimeTree();
  let h = (_lastHTML["tree"] && _lastHTML["tree"].innerHTML) || "";
  let rows = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  const jan = rows.find(r => r.indexOf("01 月") >= 0);
  const c1 = cells(jan);
  ok(c1[1] === "—", "1 月经营达成 = " + c1[1]);
  ok(c1[2] === "—", "1 月营收 = " + c1[2]);
  ok(c1[6] === "—", "1 月营收达成 = " + c1[6]);
  ok(c1[7] === "—", "1 月利润 = " + c1[7]);
  ok(c1[11] === "—", "1 月利润达成 = " + c1[11] + "（0 ÷ 亏损预算不再变成 100%）");
  ok(jan.indexOf("未录") >= 0, "标注「未录」");
  P("  1 月行：" + c1.join(" │ "));

  P("=== 2. BP 列仍然显示（预算是有的）===");
  ok(c1[4] !== "—" && c1[4] !== "", "1 月 BP 营收 = " + c1[4]);
  ok(c1[9] !== "—" && c1[9] !== "", "1 月 BP 利润 = " + c1[9]);

  P("=== 3. YTD 行全部为 — ===");
  const ytdRow = rows.find(r => r.indexOf("YTD 实际") >= 0);
  const cy = cells(ytdRow);
  ok(cy[1] === "—" && cy[2] === "—" && cy[7] === "—", "YTD 全空：" + cy.slice(0, 9).join(" │ "));

  P("=== 4. KPI 不再给出荒谬达成率 ===");
  renderKPI();
  const k = (_lastHTML["kpis"] && _lastHTML["kpis"].innerHTML) || "";
  ok(k.indexOf("本期未录数据") >= 0, "KPI 标注本期未录数据");
  ok(k.indexOf("无法计算") >= 0, "经营达成说明无法计算");
  ok(!/1[0-9]{2}\.\d%/.test(k.replace(/BP[^<]*/g, "")), "KPI 里没有 100%+ 的假达成");
  P("  " + k.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 160));

  P("=== 5. 补录 11 月数据后：只有 11 月有值 ===");
  DB.facts = backupFacts.filter(f => f.d >= Y + "-11-01" && f.d <= Y + "-11-09");
  reset();
  renderTimeTree();
  h = (_lastHTML["tree"] && _lastHTML["tree"].innerHTML) || "";
  rows = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  const oct = cells(rows.find(r => r.indexOf("10 月") >= 0));
  const nov = cells(rows.find(r => r.indexOf("11 月") >= 0));
  ok(oct[1] === "—", "10 月仍为 —");
  ok(nov[1] !== "—", "11 月有达成值：" + nov[1]);
  ok(nov[2] !== "—", "11 月有营收：" + nov[2]);

  P("=== 5b. KPI 给出「数据不完整」警示 ===");
  renderKPI();
  const k2 = (_lastHTML["kpis"] && _lastHTML["kpis"].innerHTML) || "";
  ok(k2.indexOf("未录数据，达成率仅供参考") >= 0, "KPI 有缺月警示");
  const m = k2.match(/期间 (\d+) 个月中有 (\d+) 个月未录数据/);
  ok(m && +m[2] > 0, "警示内容：" + (m ? "共 " + m[1] + " 个月，缺 " + m[2] : "未匹配"));

  P("=== 6. YTD 标注缺几个月 ===");
  const cy2 = cells(rows.find(r => r.indexOf("YTD 实际") >= 0));
  const ytdHtml = rows.find(r => r.indexOf("YTD 实际") >= 0);
  ok(ytdHtml.indexOf("缺") >= 0, "YTD 行有缺月标记");
  ok(cy2[1] !== "—", "YTD 仍有达成值（部分数据可算）：" + cy2[1]);
  P("  YTD：" + cy2.join(" │ "));

  P("=== 7. 缺口卡片提示未录月份 ===");
  renderGap();
  const cap = (_lastHTML["gapCap"] && _lastHTML["gapCap"].textContent) || "";
  ok(cap.indexOf("未录数据") >= 0, "提示：" + cap);

  P("=== 8. 恢复示例数据后行为不变（回归）===");
  DB.facts = JSON.parse(JSON.stringify(backupFacts));
  DB.bp = JSON.parse(JSON.stringify(backupBp));
  reset();
  renderTimeTree();
  h = (_lastHTML["tree"] && _lastHTML["tree"].innerHTML) || "";
  rows = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  const jan2 = cells(rows.find(r => r.indexOf("01 月") >= 0));
  ok(jan2[1] !== "—" && jan2[2] !== "—", "正常数据下 1 月照常显示：" + jan2.slice(0, 7).join(" │ "));
  ok(jan2[11] !== "—", "1 月利润达成有值：" + jan2[11]);

  P("=== 9. 全量渲染回归 ===");
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(ty => T("renderAll " + ty, () => { S.type = ty; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("对比", renderCompare); T("缺口", renderGap); T("人效", renderUnit); T("租卡", renderRent); T("录入台", renderEntry);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
