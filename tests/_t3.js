const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();

  P("=== 1. 录入台渲染 ===");
  enS.y = Y; enS.m = 11; enS.p = "P01"; enS.onlyData = false;
  renderEntry();
  const h = (_lastHTML["enGrid"] && _lastHTML["enGrid"].innerHTML) || "";
  const inputs = (h.match(/<input/g) || []).length;
  const trs = (h.match(/<tr/g) || []).length;
  ok(h.indexOf("engrid") >= 0, "表格已生成");
  ok(inputs === 990, "输入格 " + inputs + "（= 33 科目 × 30 天）");
  ok(trs === 37, "行数 " + trs + "（33 科目 + 3 分组 + 1 表头）");
  ok(h.indexOf("月固") >= 0, "固定项有「月固」标记");
  ok(h.indexOf("R02.04 储存收入") >= 0, "含收入科目行");
  ok(h.indexOf("沿用") >= 0, "含沿用按钮");
  P("  状态栏：" + _lastHTML["enMsg"].textContent);

  P("=== 2. 索引与取值 ===");
  const idx = entryIndex(Y + "-11", "P01");
  const k = "5|R02.04";
  ok(idx[k] !== undefined, "11月5日 储存收入 = " + idx[k]);
  const lib = DB.facts.filter(f => f.p === "P01" && f.a === "R02.04" && f.d === Y + "-11-05");
  ok(lib.length === 1 && Math.abs(lib[0].v - idx[k]) < 1e-9, "索引值与库内一致");

  P("=== 3. 单格写入 / 修改 / 删除 ===");
  const before = DB.facts.length;
  entrySet(Y + "-11", "P01", "R02.04", 5, 12345.67);
  let rec = DB.facts.filter(f => f.p === "P01" && f.a === "R02.04" && f.d === Y + "-11-05");
  ok(rec.length === 1 && rec[0].v === 12345.67, "改值 → " + rec[0].v);
  ok(rec[0].src === "edit", "来源标记 edit");
  ok(DB.facts.length === before, "条数不变 " + before);

  entrySet(Y + "-11", "P01", "R01.01", 3, 500);   // R01.01 示例数据里完全没有
  rec = DB.facts.filter(f => f.p === "P01" && f.a === "R01.01" && f.d === Y + "-11-03");
  ok(rec.length === 1 && rec[0].v === 500, "新增格子 → " + rec.length + " 条");
  ok(DB.facts.length === before + 1, "条数 +1 → " + DB.facts.length);

  entrySet(Y + "-11", "P01", "R01.01", 3, null);
  rec = DB.facts.filter(f => f.p === "P01" && f.a === "R01.01" && f.d === Y + "-11-03");
  ok(rec.length === 0, "清空格子 → 已删除");
  ok(DB.facts.length === before, "条数回到 " + DB.facts.length);

  P("=== 4. 整行摊平 ===");
  entrySetRow(Y + "-11", "P01", "C05.01", 31000);
  const row = DB.facts.filter(f => f.p === "P01" && f.a === "C05.01" && f.d.startsWith(Y + "-11"));
  const rowSum = row.reduce((s, f) => s + f.v, 0);
  ok(row.length === 30, "写入 " + row.length + " 天");
  ok(Math.abs(rowSum - 31000) < 0.02, "合计 " + rowSum.toFixed(2) + " = 31000");
  ok(row.every(f => f.src === "auto"), "来源 auto（摊平）");

  P("=== 5. 整行清空 ===");
  entrySetRow(Y + "-11", "P01", "C05.01", null);
  const row2 = DB.facts.filter(f => f.p === "P01" && f.a === "C05.01" && f.d.startsWith(Y + "-11"));
  ok(row2.length === 0, "整行已清空");

  P("=== 6. 上月合计 ===");
  const s = prevMonthSum(Y + "-11", "P01", "C01.01");
  const lib2 = DB.facts.filter(f => f.p === "P01" && f.a === "C01.01" && f.d.startsWith(Y + "-10")).reduce((a, f) => a + f.v, 0);
  ok(s !== null && Math.abs(s - lib2) < 0.02, "10 月房租合计 " + s + " vs 库内 " + lib2.toFixed(2));
  ok(prevMonthSum(Y + "-11", "P01", "R01.02") === null, "无数据科目返回 null");

  P("=== 7. 只看有数据的行 ===");
  enS.onlyData = true;
  renderEntry();
  const h2 = (_lastHTML["enGrid"] && _lastHTML["enGrid"].innerHTML) || "";
  const in2 = (h2.match(/<input/g) || []).length;
  ok(in2 < inputs, "过滤后格数 " + in2 + " < " + inputs);
  enS.onlyData = false;

  P("=== 8. 切换项目 ===");
  enS.p = "P04";
  renderEntry();
  const h3 = (_lastHTML["enGrid"] && _lastHTML["enGrid"].innerHTML) || "";
  ok(h3.indexOf("engrid") >= 0 && h3 !== h, "P04 视图已生成，与 P01 不同");
  enS.p = "P01";

  P("=== 9. 2 月列数 ===");
  enS.m = 2;
  renderEntry();
  const h4 = (_lastHTML["enGrid"] && _lastHTML["enGrid"].innerHTML) || "";
  const in4 = (h4.match(/<input/g) || []).length;
  ok(in4 === 33 * 28, "2 月格数 " + in4 + "（33 × 28）");
  enS.m = 11;

  P("=== 10. 编辑后其他视图无异常 ===");
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(t => T("renderAll " + t, () => { S.type = t; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("KPI", renderKPI); T("对比", renderCompare); T("租卡", renderRent);
  T("固定项", renderCarry); T("录入台", renderEntry);
  T("模板", () => buildTemplate(Y, 11));
  T("打包往返", () => { const b = unpackDB(JSON.parse(JSON.stringify(packDB(DB)))); if (b.facts.length !== DB.facts.length) throw new Error("条数"); });
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
