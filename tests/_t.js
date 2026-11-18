const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);
const cell = () => { const o = {}; return o; };

(async () => {
  await init();
  const Y = new Date().getFullYear();
  const ta = document.getElementById("txtCsv");
  const prev = () => (_lastHTML["impPrev"] && _lastHTML["impPrev"].innerHTML) || "";
  const run = t => { ta.value = t; renderImpPrev(); return lastParsed; };

  P("=== 1. 无表头长表（Tab）===");
  let r = run("2026-10-01\tP01\tR02.04\t12500\n2026-10-02\tP01\tR02.04\t13000");
  ok(r.kind === "long", "识别为 " + r.kind + " / " + r.kindTxt);
  ok(r.rows.length === 2, "行数 " + r.rows.length);
  ok(r.total === 25500, "合计 " + r.total);
  ok(r.rows[0].d === "2026-10-01", "日期 " + r.rows[0].d);
  ok(document.getElementById("btnImp").disabled === false, "导入按钮已启用");
  ok(document.getElementById("btnImp").textContent.indexOf("2 行") >= 0, "按钮文案：" + document.getElementById("btnImp").textContent);

  P("=== 2. 带表头长表（Tab），项目/科目写名称 ===");
  r = run("日期\t项目\t科目\t金额\n2026-10-01\t客户A · 3C电子\t储存收入\t12,500\n2026-10-02\t客户A · 3C电子\t储存收入\t¥13000");
  ok(r.kind === "long", "识别为长表");
  ok(r.rows.length === 2, "行数 " + r.rows.length + (r.bad.length ? "（坏行 " + r.bad.length + "）" : ""));
  ok(r.rows[0].p === "P01" && r.rows[0].a === "R02.04", "名称匹配 → " + r.rows[0].p + " / " + r.rows[0].a);
  ok(r.total === 25500, "千分位与货币符号已清洗，合计 " + r.total);

  P("=== 3. 逗号分隔 + 斜杠日期 + 括号负数 ===");
  r = run("Date,Project,Account,Amount\n2026/10/1,P01,C06.01,(1234.5)\n2026/10/2,P01,C06.01,2000");
  ok(r.kind === "long", "识别为长表");
  ok(r.rows[0].d === "2026-10-01", "斜杠日期归一 " + r.rows[0].d);
  ok(r.rows[0].v === -1234.5, "括号负数 " + r.rows[0].v);

  P("=== 4. 坏行被记录，不中断 ===");
  r = run("2026-10-01\tP01\tR02.04\t100\n2026-10-01\tP99\tR02.04\t200\n2026-10-01\tP01\tXX99\t300\nnot-a-date\tP01\tR02.04\t400\n2026-10-01\tP01\tR02.04\tabc");
  ok(r.rows.length === 1, "有效 " + r.rows.length + " 行");
  ok(r.bad.length === 4, "坏行 " + r.bad.length + " 条");
  P("   " + r.bad.map(b => "第" + b.no + "行 " + b.why).join("\n   "));

  P("=== 5. 无法识别的输入 ===");
  r = run("随便写点什么\n第二行");
  ok(r.kind === "unknown", "识别为 unknown");
  ok(prev().indexOf("无法识别") >= 0, "预览显示提示");
  ok(document.getElementById("btnImp").disabled === true, "导入按钮已禁用");

  P("=== 6. 宽表：整份全量模板粘贴 ===");
  const tpl = buildTemplate(Y, 10);
  r = run(tpl);
  ok(r.kind === "wide", "识别为 " + r.kindTxt + "（分隔符 " + (r.delim === "\t" ? "Tab" : "逗号") + "）");
  const tplLines = tpl.split("\r\n").filter(l => l && l.charAt(0) !== "#").slice(1);
  const tplHead = parseCsvLine(tpl.split("\r\n").filter(l => l && l.charAt(0) !== "#")[0]);
  const dIdx = tplHead.map((h, i) => /^\d+日$/.test(h) ? i : -1).filter(i => i >= 0);
  const tplRows = tplLines.filter(l => {
    const c = parseCsvLine(l);
    return dIdx.some(i => (c[i] || "").trim() !== "");
  }).length;
  ok(r.rows.length === tplRows, "宽表行数 " + r.rows.length + " = 模板有数据行 " + tplRows + "（总行 " + tplLines.length + "，空行被跳过）");
  ok(r.bad.length === 0, "坏行 " + r.bad.length);
  ok(r.projIds.length === 5, "涉及项目 " + r.projIds.length + "（P000 无明细，未计入）");
  P("   金额合计 USD " + Math.round(r.total).toLocaleString());

  P("=== 7. 宽表：只填月合计的行 ===");
  r = run("年月,项目编码,科目编码,月合计\n2026-11,P01,C05.01,31000");
  ok(r.kind === "wide", "识别为宽表");
  ok(r.rows[0].days.length === 0 && r.rows[0].tot === 31000, "无日列、月合计 31000");

  P("=== 8. 提交：长表 upsert ===");
  const before = DB.facts.length;
  r = run("日期\t项目\t科目\t金额\n2026-10-05\tP01\tR02.04\t99999");
  lastParsed = r;
  importCsv();
  const hit = DB.facts.filter(f => f.d === "2026-10-05" && f.p === "P01" && f.a === "R02.04");
  ok(hit.length === 1 && hit[0].v === 99999, "写入并唯一：" + hit.length + " 条，" + hit[0].v);
  ok(DB.facts.length === before, "条数未增加（覆盖已有日期）" + before + " → " + DB.facts.length);

  P("=== 9. 提交：宽表月合计摊平 ===");
  r = run("年月,项目编码,科目编码,月合计\n2026-11,P02,C05.01,31000");
  lastParsed = r;
  importCsv();
  const sp = DB.facts.filter(f => f.p === "P02" && f.a === "C05.01" && f.d.startsWith("2026-11"));
  const sum = sp.reduce((s, f) => s + f.v, 0);
  ok(sp.length === 30, "写入 " + sp.length + " 天");
  ok(Math.abs(sum - 31000) < 0.02, "合计 " + sum.toFixed(2) + "（应为 31000）");
  ok(sp.every(f => f.src === "auto"), "来源标记为 auto（月摊）");

  P("=== 10. 预览 HTML 结构 ===");
  r = run("日期\t项目\t科目\t金额\n2026-10-01\tP01\tR02.04\t12500\n2026-10-01\tP02\tC01.01\t300\nbadrow");
  const html = prev();
  ok(html.indexOf("long") < 0 && html.indexOf("长表") >= 0, "含格式标签");
  ok(html.indexOf("有效 <b>2</b> 行") >= 0, "含有效行数");
  ok(html.indexOf("跳过 1 行") >= 0, "含跳过行数");
  ok(html.indexOf("<table>") >= 0, "含预览表格");
  ok(html.indexOf("逐条写入") >= 0, "含覆盖规则说明");

  P("=== 11. 回归 ===");
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD","MTD","M","W"].forEach(t => T("renderAll " + t, () => { S.type = t; S.month = 10; S.week = 2; S.project = "ALL"; renderAll(); }));
  T("面板", renderPanel); T("KPI", renderKPI); T("对比", renderCompare); T("租卡", renderRent);
  T("模板全量", () => buildTemplate(Y, 10));
  T("模板历史", () => buildHistTemplate(Y));
  T("BP表", () => renderBpTable());
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
