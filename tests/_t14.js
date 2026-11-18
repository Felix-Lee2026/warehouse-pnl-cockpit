const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; };

  P("=== 1. 基本结构 ===");
  reset();
  DB.meta.checkRev = []; DB.meta.checkProfit = [];
  const txt = buildDiag();
  /* 标题前缀会随分发版本变（本地版 / 社区版），只校验固定部分 */
  ok(txt.indexOf("经营损益驾驶舱 · 诊断摘要") >= 0, "有标题");
  ok(txt.indexOf("## 口径") >= 0, "有口径段");
  ok(txt.indexOf("## 逐月汇总") >= 0, "有逐月汇总");
  ok(txt.indexOf("## 仓租") >= 0, "有仓租段");
  ok(txt.indexOf("## 科目覆盖") >= 0, "有科目覆盖");
  ok(txt.indexOf("## 数据规模") >= 0, "有数据规模");
  ok(txt.indexOf("本摘要不含任何逐笔明细") >= 0, "有隐私声明");
  P("  字符数 " + txt.length + "，行数 " + txt.split("\n").length);

  P("=== 2. 逐月数字与库内一致 ===");
  const lines = txt.split("\n");
  const hIdx = lines.findIndex(l => l.indexOf("月份\t收入") >= 0);
  ok(hIdx > 0, "表头行存在");
  let eqAll = true, bad = "";
  for (let m = 1; m <= 11; m++) {
    const row = lines[hIdx + m].split("\t");
    const ym = Y + "-" + pad(m);
    const {acc, d} = monthAgg(ym, projSet());
    const spill = acc["C08"] || 0;
    const rev = +row[1], cost = +row[2], sp = +row[3], pro = +row[4];
    if (Math.abs(rev - d.rev) > 1 || Math.abs(cost - (d.cAll - spill)) > 1 ||
        Math.abs(sp - spill) > 1 || Math.abs(pro - d.profit) > 1) {
      eqAll = false; bad = row.join("|");
    }
  }
  ok(eqAll, "11 个月四列全部对上" + (bad ? "，例外 " + bad : ""));
  const totalRow = lines[hIdx + 13].split("\t");
  ok(totalRow[0] === "合计", "有合计行");
  P("  合计：" + totalRow.slice(1, 5).join(" / "));

  P("=== 3. 不含明细行 ===");
  const dateHits = (txt.match(/\d{4}-\d{2}-\d{2}/g) || []);
  ok(dateHits.length <= 2, "只出现 " + dateHits.length + " 个日期（仅数据范围首末，非逐笔）");
  ok(txt.split("\n").filter(l => l.split("\t").length > 10).length === 0, "没有超宽行（明细才会那么宽）");
  ok(!/P0\d\s+(客户|R02|C01)/.test(txt), "不含 项目+科目 的逐条记录");

  P("=== 4. 仓租段 ===");
  const rIdx = lines.findIndex(l => l.indexOf("## 仓租") >= 0);
  ok(lines[rIdx + 1].indexOf("01:") >= 0, "逐月列出：" + lines[rIdx + 1].slice(0, 60));
  ok(lines[rIdx + 2].indexOf("全年合计") >= 0, "有全年合计：" + lines[rIdx + 2]);
  let yr = 0; for (let m = 1; m <= 12; m++) yr += rentOf(Y + "-" + pad(m));
  ok(lines[rIdx + 2].indexOf(String(yr)) >= 0, "合计值 " + yr + " 与 rentOf 一致");
  ok(lines[rIdx + 3].indexOf("空置") >= 0, "有空置推导");

  P("=== 5. 科目覆盖 ===");
  const cIdx = lines.findIndex(l => l.indexOf("## 科目覆盖") >= 0);
  ok(lines[cIdx + 1].indexOf("可填科目") >= 0, "有覆盖统计：" + lines[cIdx + 1]);
  const mm = lines[cIdx + 1].match(/可填科目 (\d+) 个，本年有数据 (\d+) 个/);
  ok(!!mm && +mm[2] <= +mm[1], "数字合理 " + (mm ? mm[2] + "/" + mm[1] : ""));

  P("=== 6. 填了对照值才出现差异段 ===");
  ok(txt.indexOf("## 与外部报表的差异") < 0, "没填时不出现");
  DB.meta.checkRev = [100000, 200000];
  DB.meta.checkProfit = [-50000, -80000];
  const txt2 = buildDiag();
  ok(txt2.indexOf("## 与外部报表的差异") >= 0, "填了才出现");
  ok(txt2.indexOf("收入：工具") >= 0 && txt2.indexOf("利润：工具") >= 0, "有两行对照");
  P("  " + txt2.split("\n").filter(l => l.indexOf("收入：工具") >= 0 || l.indexOf("利润：工具") >= 0).join("\n  "));

  P("=== 7. BP 与人数状态 ===");
  ok(txt.indexOf("BP：已录") >= 0, "BP 状态：" + txt.split("\n").find(l => l.indexOf("BP：") >= 0));
  ok(txt.indexOf("在编人数：") >= 0, "人数行：" + txt.split("\n").find(l => l.indexOf("在编人数") >= 0));

  P("=== 8. 单项目视角也能导出 ===");
  S.project = "P01";
  let e8 = null;
  try { e8 = buildDiag(); ok(true, "无异常"); } catch (err) { ok(false, "异常：" + err.message); }
  ok(e8 && e8.indexOf("诊断摘要") >= 0, "生成成功");
  S.project = "ALL";

  P("=== 9. 空数据不崩溃 ===");
  const bf = DB.facts; DB.facts = [];
  let e9 = null;
  try { e9 = buildDiag(); ok(true, "无异常"); } catch (err) { ok(false, "异常：" + err.message); }
  ok(e9 && e9.indexOf("全部 0 条") >= 0, "数据规模显示 0 条");
  DB.facts = bf;

  P("=== 10. 回归 ===");
  DB.meta.checkRev = []; DB.meta.checkProfit = [];
  reset();
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(ty => T("renderAll " + ty, () => { S.type = ty; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("核对台", renderCheck); T("拆解", renderRecon); T("缺口", renderGap);
  T("人效", renderUnit); T("录入台", renderEntry); T("仓租表", renderRentTable); T("预览", renderRentPreview);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
