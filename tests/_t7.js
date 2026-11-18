const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

/* 最小 DOM 模拟：只实现 pasteMatrix / entryRecalc 用到的方法 */
function mockGrid(accs, dim){
  const rows = [];
  const table = {
    querySelectorAll(sel){ return sel === "tr[data-a]" ? rows : []; }
  };
  accs.forEach(a => {
    const inputs = [];
    const totEl = {textContent: ""};
    const row = {
      dataset: {a},
      closest(sel){ return sel === "table" ? table : null; },
      querySelectorAll(sel){ return (sel === "input" || sel === "input[data-d]") ? inputs : []; },
      querySelector(sel){ return sel === ".tot" ? totEl : null; }
    };
    for (let d = 1; d <= dim; d++) {
      inputs.push({
        tagName: "INPUT", dataset: {d: String(d)}, value: "",
        closest(sel){ return sel === "tr" ? row : (sel === "table" ? table : null); },
        focus(){}, select(){}
      });
    }
    rows.push(row);
  });
  return rows;
}
const ins = r => r.querySelectorAll("input");
const vals = r => ins(r).map(i => String(i.value));

(async () => {
  await init();
  const Y = new Date().getFullYear();
  enS.y = Y; enS.m = 11; enS.p = "P01";
  const ym = Y + "-11";
  const ACCS = ["R02.01", "R02.02", "C01.01", "C05.01"];

  P("=== 1. 用户场景：一行 9 个数 ===");
  let rows = mockGrid(ACCS, 30);
  let r = pasteMatrix(ins(rows[0])[0], "0\t640\t199\t0\t484\t237\t0\t0\t881", false);
  ok(r.n === 9, "写入 " + r.n + " 个格子");
  ok(r.rows === 1, "只影响 " + r.rows + " 个科目行");
  const v0 = vals(rows[0]).slice(0, 11);
  ok(v0.slice(0, 9).join(",") === "0,640,199,0,484,237,0,0,881", "1-9 日 = " + v0.slice(0, 9).join(","));
  ok(v0[9] === "" || v0[9] === "0" || isFinite(+v0[9]), "第 10 日未被破坏（" + (v0[9] || "空") + "）");

  P("=== 2. 0 值必须写入，不能被当成空 ===");
  const rec0 = DB.facts.filter(f => f.p === "P01" && f.a === "R02.01" && f.d === ym + "-01");
  ok(rec0.length === 1 && rec0[0].v === 0, "1 日写入 0 值：" + (rec0.length ? rec0[0].v : "无记录"));

  P("=== 3. 库内数据与界面一致 ===");
  const rec640 = DB.facts.filter(f => f.p === "P01" && f.a === "R02.01" && f.d === ym + "-02");
  ok(rec640.length === 1 && rec640[0].v === 640, "2 日 = " + (rec640.length ? rec640[0].v : "无"));

  P("=== 4. 多行粘贴跨科目 ===");
  rows = mockGrid(ACCS, 30);
  r = pasteMatrix(ins(rows[0])[0], "11\t22\n33\t44", false);
  ok(r.n === 4 && r.rows === 2, "2×2 写入 " + r.n + " 格 / " + r.rows + " 行");
  ok(vals(rows[0]).slice(0, 2).join(",") === "11,22", "科目1 前两日 = " + vals(rows[0]).slice(0, 2).join(","));
  ok(vals(rows[1]).slice(0, 2).join(",") === "33,44", "科目2 前两日 = " + vals(rows[1]).slice(0, 2).join(","));

  P("=== 5. 从中间开始粘 ===");
  rows = mockGrid(ACCS, 30);
  r = pasteMatrix(ins(rows[0])[14], "1\t2\t3", false);   // 第 15 格
  ok(vals(rows[0])[14] === "1" && vals(rows[0])[16] === "3", "从第 15 日铺开：" + vals(rows[0]).slice(14, 17).join(","));
  ok(vals(rows[0])[13] !== "1", "前面格子未受影响");

  P("=== 6. 超边界截断 ===");
  rows = mockGrid(ACCS, 30);
  const many = Array.from({length: 35}, (_, i) => i + 1).join("\t");
  r = pasteMatrix(ins(rows[0])[0], many, false);
  ok(r.n === 30, "35 个值只写入 " + r.n + " 个（列到 30 为止）");
  ok(vals(rows[0])[29] === "30", "最后一格 = " + vals(rows[0])[29]);

  P("=== 7. 尾随换行不产生空行 ===");
  rows = mockGrid(ACCS, 30);
  r = pasteMatrix(ins(rows[0])[0], "7\t8\n", false);
  ok(r.n === 2 && r.rows === 1, "写入 " + r.n + " 格 / " + r.rows + " 行");

  P("=== 8. 非数字跳过 ===");
  rows = mockGrid(ACCS, 30);
  r = pasteMatrix(ins(rows[0])[0], "1\tabc\t3", false);
  ok(r.n === 2 && r.skipped === 1, "写入 " + r.n + "，跳过 " + r.skipped);

  P("=== 9. 空字符串清空已有值 ===");
  rows = mockGrid(ACCS, 30);
  pasteMatrix(ins(rows[0])[0], "9\t9\t9", false);
  ok(vals(rows[0]).slice(0, 3).join(",") === "9,9,9", "先写入 9,9,9");
  rows = mockGrid(ACCS, 30);
  r = pasteMatrix(ins(rows[0])[1], "\t", false);   // 从第 2 格开始，清空 2、3 格
  const gone = DB.facts.filter(f => f.p === "P01" && f.a === "R02.01" && (f.d === ym + "-02" || f.d === ym + "-03"));
  ok(gone.length === 0, "空值清空后无残留记录（" + gone.length + " 条）");

  P("=== 10. 转置粘贴（横排科目 → 竖排） ===");
  rows = mockGrid(ACCS, 30);
  r = pasteMatrix(ins(rows[0])[0], "100\t200\t300", true);
  ok(r.n === 3, "写入 " + r.n + " 格");
  ok(vals(rows[0])[0] === "100" && vals(rows[1])[0] === "200" && vals(rows[2])[0] === "300",
     "转置后竖着排：" + [0, 1, 2].map(i => vals(rows[i])[0]).join(","));
  ok(!vals(rows[0])[1], "同一行第 2 日未被写入");

  P("=== 11. 千分位与货币符号 ===");
  rows = mockGrid(ACCS, 30);
  r = pasteMatrix(ins(rows[0])[0], "12,500\t¥8,000\t(1,200)", false);
  ok(vals(rows[0]).slice(0, 3).join(",") === "12500,8000,-1200", "清洗后 = " + vals(rows[0]).slice(0, 3).join(","));

  P("=== 12. 粘贴后月合计重算 ===");
  rows = mockGrid(ACCS, 30);
  pasteMatrix(ins(rows[0])[0], "100\t200\t300", false);
  const totEl = rows[0].querySelector(".tot");
  ok(totEl && totEl.textContent.replace(/,/g, "") === "600", "月合计 = " + (totEl ? totEl.textContent : "无"));

  P("=== 13. 回归 ===");
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  S.year = Y; S.project = "ALL";
  ["YTD","MTD","M","W"].forEach(t => T("renderAll " + t, () => { S.type = t; S.month = 11; S.week = 2; renderAll(); }));
  T("面板", renderPanel); T("对比", renderCompare); T("缺口", renderGap); T("人效", renderUnit);
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
