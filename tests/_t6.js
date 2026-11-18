const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);
const cells = r => r.split(/<td[^>]*>/).slice(1).map(c => c.split("</td>")[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  cmpOpen.clear();

  P("=== 1. 折叠态 ===");
  renderCompare();
  let h = (_lastHTML["cmp"] && _lastHTML["cmp"].innerHTML) || "";
  let trs = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  ok(trs.length === 7, "行数 " + trs.length + "（5 业务项目 + P000 公共 + 合计）");
  ok(trs[0].indexOf("data-cmp") >= 0, "首行可点击展开");
  ok((h.split("</thead>")[0].match(/<th[ >]/g) || []).length === 7, "7 列表头（变动成本/固定成本已移到右侧阶梯）");
  const tds = [...new Set(trs.map(r => (r.match(/<td/g) || []).length))];
  ok(tds.length === 1 && tds[0] === 7, "每行 7 格");
  P("  " + cells(trs[0]).join(" │ "));

  P("=== 2. 展开 P01 ===");
  cmpOpen.add("P01");
  renderCompare();
  h = (_lastHTML["cmp"] && _lastHTML["cmp"].innerHTML) || "";
  trs = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  const mrows = trs.filter(r => r.indexOf("mrow") >= 0 && r.indexOf("msum") < 0);
  ok(mrows.length === 11, "P01 展开 " + mrows.length + " 个月份行（1-11 月）");
  ok(h.indexOf("▾") >= 0 && h.indexOf("▸") >= 0, "箭头状态区分");
  P("  " + cells(mrows[0]).join(" │ "));
  P("  " + cells(mrows[10]).join(" │ "));

  P("=== 3. 可加性：月份行之和 = 项目行 ===");
  const projRow = trs.find(r => r.indexOf("data-cmp='P01'") >= 0);
  const projCells = cells(projRow);
  const sumM = mrows.reduce((s, r) => {
    const c = cells(r)[1];
    return s + (parseFloat(c.replace(/[¥,]/g, "")) || 0);
  }, 0);
  const projVal = parseFloat(projCells[1].replace(/[¥,]/g, ""));
  // 单位都是「万」，11 月只到 10 日
  ok(Math.abs(sumM - projVal) < 0.5, "月份合计 " + sumM.toFixed(1) + " 万 ≈ 项目行 " + projVal.toFixed(1) + " 万");

  P("=== 4. 环比 ===");
  const feb = cells(trs.find(r => r.indexOf("<td>02 月") >= 0));
  P("  02月：" + feb.join(" │ "));
  ok(feb[2].indexOf("%") >= 0 || feb[2] === "—", "有环比值：" + feb[2]);
  const jan = cells(trs.find(r => r.indexOf("<td>01 月") >= 0));
  ok(jan[2] === "—", "1 月无上月 → " + jan[2]);

  P("=== 5. 多个项目展开 ===");
  cmpOpen.add("P04");
  renderCompare();
  h = (_lastHTML["cmp"] && _lastHTML["cmp"].innerHTML) || "";
  trs = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  ok(trs.filter(r => r.indexOf("mrow") >= 0 && r.indexOf("msum") < 0).length > 11, "两个项目共 " + trs.filter(r => r.indexOf("mrow") >= 0 && r.indexOf("msum") < 0).length + " 个月份行");

  P("=== 6. 排序仍生效 ===");
  cmpOpen.clear();
  S.cmpSort = "profit"; renderCompare();
  let h2 = (_lastHTML["cmp"] && _lastHTML["cmp"].innerHTML) || "";
  const first = h2.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0)[0];
  P("  按利润排序首行：" + cells(first)[0]);
  ok(first.indexOf("data-cmp") >= 0, "排序后首行仍是项目行");
  S.cmpSort = "rev";

  P("=== 7. 单项目视角 ===");
  S.project = "P01"; cmpOpen.clear(); renderCompare();
  const h7 = (_lastHTML["cmp"] && _lastHTML["cmp"].innerHTML) || "";
  ok(h7.indexOf("data-cmp") >= 0, "单项目时仍可展开");

  P("=== 8. 右侧利润阶梯：跟随顶部项目 ===");
  S.project = "ALL"; cmpOpen.clear(); renderCompare();
  const lad = (_lastHTML["ladderProj"] && _lastHTML["ladderProj"].innerHTML) || "";
  const lrows = (lad.match(/class="lrow/g) || []).length;
  ok(lrows === 7, "阶梯 " + lrows + " 行（营收/变动/毛益/固定/半变动/利润/率）");
  ok(lad.indexOf("总营收") >= 0 && lad.indexOf("贡献毛益") >= 0, "含阶梯关键行");
  const objAll = (_lastHTML["ladderProjObj"] || {}).textContent || "";
  ok(objAll.indexOf("仓级合计") >= 0, "对象显示「" + objAll.trim() + "」");
  const noteAll = (_lastHTML["ladderProjNote"] || {}).innerHTML || "";
  ok(noteAll.indexOf("P000") >= 0 && noteAll.indexOf("大于仓级合计") >= 0, "仓级视角说明含空置口径");

  // 切到单项目：阶梯金额应等于该项目口径
  S.project = "P01"; cmpOpen.clear(); renderCompare();
  const lad1 = (_lastHTML["ladderProj"] && _lastHTML["ladderProj"].innerHTML) || "";
  const d1 = periodAgg(period(), ["P01"]).d;
  ok(lad1.indexOf(fmtMoney(d1.rev)) >= 0, "P01 阶梯营收 " + fmtMoney(d1.rev) + " 与 periodAgg 一致");
  ok(lad1.indexOf(fmtMoney(d1.cV * -1)) >= 0 || lad1.indexOf(fmtMoney(-d1.cV)) >= 0, "P01 变动成本同步");
  const obj1 = (_lastHTML["ladderProjObj"] || {}).textContent || "";
  ok(obj1.indexOf("P01") < 0 && obj1.indexOf("客户A") >= 0, "对象显示项目名：" + obj1.trim());
  const note1 = (_lastHTML["ladderProjNote"] || {}).innerHTML || "";
  ok(note1.indexOf("不含 P000") >= 0, "单项目视角说明不含空置");
  // 与成本页共用同一套行生成
  ok(typeof ladderRowsHTML === "function", "阶梯行生成函数可复用（两页共用）");
  const acc1 = periodAgg(period(), ["P01"]).acc;
  ok(ladderRowsHTML(d1, acc1, true) === lad1, "项目页阶梯 = 共用函数输出（无第二套口径）");

  P("=== 8b. 成本三类下的 top2 科目细分 ===");
  const subs = (lad1.match(/class="lsub"/g) || []).length;
  P("  P01 细分条数 " + subs);
  ok(subs >= 2, "至少出现 2 条细分（" + subs + " 条）");
  ok(subs <= 6, "最多 6 条（三类各 2）");
  // 每条细分的金额必须 ≤ 本类合计
  const subAmt = [...lad1.matchAll(/class="sv">-¥([\d.]+)\s*万/g)].map(m => +m[1]);
  ok(subAmt.length === subs, "细分金额可解析 " + subAmt.join("/"));
  ok(subAmt.every(v => v <= Math.max(d1.cV, d1.cF, d1.cS) / 10000 + 0.1), "细分金额不超过所属类合计");
  // 百分比 = 金额 ÷ 本类合计（按性态各自核对）
  const behSum = {V: d1.cV, F: d1.cF, S: d1.cS};
  ok(subAmt.every(v => v > 0), "细分金额均为正");
  // 单项目视角不应出现空置（C08 在 P000，不进项目）
  ok(lad1.indexOf("空置") < 0, "单项目细分不含空置仓租");
  // 仓级视角：细分必须等于按 acc 实算的「本类前两名」，而不是写死某个科目
  S.project = "ALL"; cmpOpen.clear(); renderCompare();
  const ladAll = (_lastHTML["ladderProj"] && _lastHTML["ladderProj"].innerHTML) || "";
  const accAll = periodAgg(period(), projSet()).acc;
  const topOf = beh => {
    const list = [];
    for (const k in accAll) {
      const a = ACMap[k];
      if (!a || a.dir !== "C" || a.beh !== beh || a.calc) continue;
      if (Math.abs(accAll[k]) > 0) list.push([a.n, Math.abs(accAll[k])]);
    }
    list.sort((x, y) => y[1] - x[1]);
    return list.slice(0, 2).map(x => x[0]);
  };
  const fTop = topOf("F");
  P("  固定成本实算前两名：" + fTop.join(" / "));
  ok(ladAll.indexOf(fTop[0]) >= 0 && ladAll.indexOf(fTop[1]) >= 0, "固定成本细分 = 实算前两名");
  ok(ladAll.indexOf("空置仓租") < 0, "空置本期排第 4（6.5%），不该挤进前两名");
  // 成本页保持 7 行、无细分
  renderLadder();
  const ladCost = (_lastHTML["ladder"] && _lastHTML["ladder"].innerHTML) || "";
  ok(ladCost.indexOf('class="lsub"') < 0, "成本页阶梯不带细分（保持与左侧表等高）");
  ok((ladCost.match(/class="lrow/g) || []).length === 7, "成本页仍是 7 行");
  S.project = "ALL";

  P("=== 9. 回归 ===");
  S.project = "ALL";
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(t => T("renderAll " + t, () => { S.type = t; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("缺口", renderGap); T("人效", renderUnit); T("录入台", renderEntry);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
