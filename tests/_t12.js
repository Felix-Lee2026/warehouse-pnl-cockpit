const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);
const cells = r => r.split(/<td[^>]*>/).slice(1).map(c => c.split("</td>")[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const num = s => parseFloat(String(s).replace(/[, \u2014]/g, "")) || 0;

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; };

  P("=== 1. 结构 ===");
  DB.meta.checkRev = []; DB.meta.checkProfit = [];
  reset(); renderCheck();
  let h = (_lastHTML["check"] && _lastHTML["check"].innerHTML) || "";
  const head = h.split("</thead>")[0];
  ok((head.match(/<th[ >]/g) || []).length === 8, "8 列表头");
  let rows = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  ok(rows.length === 13, "12 个月行 + 1 合计 = " + rows.length);
  ok(h.indexOf("把外部报表的逐月数字粘进") >= 0, "空状态有引导");
  ok((h.match(/class='chkin'/g) || []).length === 24, "24 个输入格（12×2）");

  P("=== 2. 逐月取值与库内一致 ===");
  const mSet = factMonthSet(projSet());
  let eqAll = true, sample = "";
  for (let m = 1; m <= 11; m++) {
    const ym = Y + "-" + pad(m);
    const {acc, d} = monthAgg(ym, projSet());
    const sp = acc["C08"] || 0;
    const c = cells(rows[m - 1]);
    const revCell = num(c[1]), proCell = num(c[3]), costCell = num(c[6]), spCell = num(c[7]);
    if (Math.abs(revCell - d.rev) > 0.02 || Math.abs(proCell - d.profit) > 0.02 ||
        Math.abs(costCell - (d.cAll - sp)) > 0.02 || Math.abs(spCell - sp) > 0.02) {
      eqAll = false; sample = m + "月 " + c.join("|");
    }
  }
  ok(eqAll, "收入/利润/明细成本/溢出 四列与 aggregate 逐月一致" + (sample ? "，例外 " + sample : ""));

  P("=== 3. 构造用户场景：报表不含仓租溢出 ===");
  const keepRent = JSON.parse(JSON.stringify(DB.rent));
  const keepDef = DB.meta.rentDefault;
  DB.rent = {}; DB.meta.rentDefault = 1000;   /* 故意设小，让溢出转负 */
  reset();
  const refP = [], refR = [], proTool = [], spList = [];
  for (let m = 1; m <= 11; m++) {
    const ym = Y + "-" + pad(m);
    const {acc, d} = monthAgg(ym, projSet());
    const sp = acc["C08"] || 0;
    proTool.push(d.profit); spList.push(sp);
    refP.push(d.profit + sp);          /* 用户口径 = 明细利润（不含溢出） */
    refR.push(d.rev);
  }
  const sumSp = spList.reduce((a, b) => a + b, 0);
  const sumDiff = proTool.reduce((a, b) => a + b, 0) - refP.reduce((a, b) => a + b, 0);
  P("  溢出合计 " + Math.round(sumSp).toLocaleString() + "，利润差合计 " + Math.round(sumDiff).toLocaleString());
  ok(Math.abs(sumDiff + sumSp) < 1, "利润差 = −溢出（恒等）");

  DB.meta.checkRev = refR.map(v => v.toFixed(2));
  DB.meta.checkProfit = refP.map(v => v.toFixed(2));
  reset(); renderCheck();
  h = (_lastHTML["check"] && _lastHTML["check"].innerHTML) || "";
  ok(h.indexOf("差额就是「空置仓租」") >= 0, "诊断命中：差额就是空置仓租");
  ok(h.indexOf("口径差") >= 0, "说明是口径差不是算错");
  const mm = h.match(/少 <b>(-?[\d,\.]+)<\/b>/);
  ok(!!mm, "给出差额金额 " + (mm ? mm[1] : ""));

  P("=== 4. 溢出为负时会明确提示「冲减」 ===");
  ok(sumSp < 0, "本例溢出为负（" + Math.round(sumSp).toLocaleString() + "）");
  ok(h.indexOf("空置为负") >= 0 && h.indexOf("冲减") >= 0, "提示空置为负会冲减成本");

  P("=== 5. 一键清零后差额应消失 ===");
  DB.rent = {}; DB.meta.rentDefault = 0;
  reset(); renderCheck();
  h = (_lastHTML["check"] && _lastHTML["check"].innerHTML) || "";
  rows = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  const totZero = cells(rows[rows.length - 1]);
  ok(Math.abs(num(totZero[5])) < 1, "仓租为 0 后利润差 = " + totZero[5]);
  ok(h.indexOf("逐月对齐") >= 0, "诊断转为「利润逐月对齐」");
  DB.rent = keepRent; DB.meta.rentDefault = keepDef;

  P("=== 6. 恒定差额场景 ===");
  DB.rent = keepRent; DB.meta.rentDefault = keepDef;
  reset();
  const proNow = [];
  for (let m = 1; m <= 11; m++) {
    const ym = Y + "-" + pad(m);
    proNow.push(monthAgg(ym, projSet()).d.profit);
  }
  DB.meta.checkProfit = proNow.map(v => (v + 50000).toFixed(2));
  DB.meta.checkRev = [];
  reset(); renderCheck();
  h = (_lastHTML["check"] && _lastHTML["check"].innerHTML) || "";
  ok(h.indexOf("固定金额") >= 0, "诊断命中：固定金额");
  ok(h.indexOf("50,000") >= 0 || h.indexOf("50000") >= 0, "写出月均差额");

  P("=== 7. 完全对齐场景 ===");
  DB.meta.checkProfit = proNow.map(v => v.toFixed(2));
  DB.meta.checkRev = [];
  reset(); renderCheck();
  h = (_lastHTML["check"] && _lastHTML["check"].innerHTML) || "";
  ok(h.indexOf("逐月对齐") >= 0, "诊断：逐月对齐");

  P("=== 8. 收入列对照也能识别 ===");
  DB.meta.checkRev = refR.map(v => v.toFixed(2));
  DB.meta.checkProfit = [];
  reset(); renderCheck();
  h = (_lastHTML["check"] && _lastHTML["check"].innerHTML) || "";
  rows = h.split("<tbody>")[1].split("</tr>").filter(r => r.indexOf("<td") >= 0);
  const tot = cells(rows[rows.length - 1]);
  ok(Math.abs(num(tot[2]) - num(tot[1])) < 1, "收入合计：" + tot[1] + " vs 对照 " + tot[2]);

  P("=== 9. 数据体检（只填收入时也应显示） ===");
  DB.meta.checkRev = []; DB.meta.checkProfit = [];
  reset(); renderCheck();
  h = (_lastHTML["check"] && _lastHTML["check"].innerHTML) || "";
  ok(h.indexOf("数据体检") >= 0, "含数据体检");
  const bm = h.match(/年 <b>([\d,]+)<\/b> 条明细/);
  ok(!!bm, "明细条数 " + (bm ? bm[1] : ""));
  ok(h.indexOf("个科目") >= 0, "含科目覆盖");
  ok(h.indexOf("明细成本") >= 0, "含明细成本合计");
  ok(h.indexOf("三项合计") >= 0, "含三项合计说明");
  const cm = h.match(/明细成本 <b>(-?[\d,\.]+)<\/b>/);
  ok(!!cm, "明细成本合计 " + (cm ? cm[1] : ""));

  P("=== 10. 回归 ===");
  DB.meta.checkRev = []; DB.meta.checkProfit = [];
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(ty => T("renderAll " + ty, () => { S.type = ty; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("拆解", renderRecon); T("缺口", renderGap); T("对比", renderCompare);
  T("人效", renderUnit); T("录入台", renderEntry); T("固定项", renderCarry);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
