const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  P("=== 1. 导航与页面清单 ===");
  ok(Array.isArray(PAGES), "PAGES 存在");
  ok(PAGES.length === 14, "14 个页面：" + PAGES.join("、"));
  ["overview", "tree", "proj", "cost", "fin", "recon", "entry", "base", "bp", "findata", "fx", "import", "backup", "report"].forEach(p => {
    ok(PAGES.indexOf(p) >= 0, "含页面 " + p);
  });

  P("=== 2. 路由切换（无 DOM 环境下不报错）===");
  let e1 = null;
  try { goPage("recon"); } catch (e) { e1 = e.message; }
  ok(!e1, "goPage('recon') 无异常" + (e1 ? "：" + e1 : ""));
  ok(curPage === "recon", "curPage = " + curPage);
  goPage("entry");
  ok(curPage === "entry", "切到 entry");
  goPage("不存在的页");
  ok(curPage === "overview", "非法页面回落到 overview");

  P("=== 3. 绑定函数存在 ===");
  ok(typeof bindNav === "function", "bindNav 可调用");
  ok(typeof hashPage === "function", "hashPage 可调用");

  P("=== 4. 数据页的渲染函数都在 ===");
  ["renderEntry", "renderPanel", "renderBpTable", "renderRentTable", "renderRentPreview", "renderCarry"].forEach(fn => {
    ok(typeof global[fn] === "function" || typeof eval(fn) === "function", fn + " 存在");
  });

  P("=== 5. 汇率与仓租页：从导航直接进入也要有内容 ===");
  /* 回归：renderFxTable / 仓级参数赋值原先只写在 renderPanel() 里，
     goPage("fx") 只调仓租表 → 直接点导航进去时汇率表是空的（只有标题）。 */
  _lastHTML["tblFx"] = undefined;
  _lastHTML["inRentDefault"] = undefined;
  _lastHTML["inFxDefault"] = undefined;
  _lastHTML["inHeadcount"] = undefined;
  goPage("fx");
  const fxHtml = (_lastHTML["tblFx"] || {}).innerHTML || "";
  ok(fxHtml.indexOf("2026-01") >= 0 && fxHtml.indexOf("data-fx=") >= 0, "汇率表有 12 个月的行");
  ok((fxHtml.match(/data-fx=/g) || []).length === 12, "12 个汇率输入框");
  ok(((_lastHTML["inFxDefault"] || {}).value || "") !== "", "默认汇率已回填：" + (_lastHTML["inFxDefault"] || {}).value);
  ok(((_lastHTML["inHeadcount"] || {}).value) !== undefined, "在编人数已回填");
  const rentHtml = (_lastHTML["tblRent"] || {}).innerHTML || "";
  ok((rentHtml.match(/data-rent=/g) || []).length === 12, "仓租表同时有 12 行（同一入口）");

  P("=== 6. 数据导入 / 备份页的直接进入 ===");
  _lastHTML["tplYear"] = undefined;
  _lastHTML["tplMonth"] = undefined;
  _lastHTML["bakMsg"] = undefined;
  goPage("import");
  const tyHtml = (_lastHTML["tplYear"] || {}).innerHTML || "";
  const tmHtml = (_lastHTML["tplMonth"] || {}).innerHTML || "";
  ok((tyHtml.match(/<option/g) || []).length >= 1, "模板年份下拉有选项");
  ok((tmHtml.match(/<option/g) || []).length === 12, "模板月份 12 个选项");
  ok(tyHtml.indexOf(String(S.year)) >= 0, "含当前年份 " + S.year);
  // 守卫：用户选过之后不能被重渲染覆盖
  _lastHTML["tplYear"].innerHTML = "<option selected>1999</option>";
  renderTplPeriod();
  ok(_lastHTML["tplYear"].innerHTML === "<option selected>1999</option>", "已填过则不覆盖用户选择");
  goPage("backup");
  ok(((_lastHTML["bakMsg"] || {}).textContent || "").indexOf("条明细记录") >= 0,
     "备份页显示记录数：" + (_lastHTML["bakMsg"] || {}).textContent);

  P("=== 6. 仓容底数（总托盘位 / 总容积）===");
  DB.meta.palletCap = 1200; DB.meta.cbmCap = 8500.5;
  _lastHTML["inPalletCap"] = undefined; _lastHTML["inCbmCap"] = undefined;
  goPage("fx");
  ok(String((_lastHTML["inPalletCap"] || {}).value) === "1200", "托盘位回填 " + (_lastHTML["inPalletCap"] || {}).value);
  ok(Math.abs(+((_lastHTML["inCbmCap"] || {}).value) - 8500.5) < 1e-9, "总容积回填 " + (_lastHTML["inCbmCap"] || {}).value);
  // 备份包往返不丢（meta 整体打包）
  const pk = JSON.parse(JSON.stringify(packDB(DB)));
  const back = unpackDB(JSON.parse(JSON.stringify(pk)));
  ok(back.meta.palletCap === 1200 && back.meta.cbmCap === 8500.5, "包往返后仓容字段仍在");
  // 诊断摘要里可见
  ok(buildDiag().indexOf("总容积 8500.5") >= 0, "诊断摘要含仓容");
  ok(buildDiag().indexOf("不参与计算") >= 0, "诊断摘要标注不参与计算");
  // 孤立性：不改变任何经营数字
  _spillCache = {}; mCache = {};
  const before = periodAgg(period(), projSet()).d;
  DB.meta.palletCap = 999999; DB.meta.cbmCap = 123456;
  _spillCache = {}; mCache = {};
  const after = periodAgg(period(), projSet()).d;
  ok(before.rev === after.rev && before.profit === after.profit && before.cAll === after.cAll,
     "改仓容不影响营收/成本/利润（孤立字段）");
  DB.meta.palletCap = 0; DB.meta.cbmCap = 0;

  P("=== 7. 全量渲染回归 ===");
  let o = 0, fail = [];
  const T = (n, fn) => { try { fn(); o++; } catch (e) { fail.push(n + " :: " + e.message); } };
  ["YTD", "MTD", "M", "W"].forEach(ty => T("renderAll " + ty, () => { S.type = ty; S.month = 11; S.week = 2; S.project = "ALL"; renderAll(); }));
  P("  通过 " + o + "/" + (o + fail.length));
  fail.forEach(f => P("    FAIL " + f));
})();
