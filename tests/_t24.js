const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; _projDataCache = null; };

  P("=== 1. 状态清单里有「预导入」 ===");
  ok(PROJ_STATUS.indexOf("预导入") >= 0, "状态取值：" + PROJ_STATUS.join(" / "));
  ok(PROJ_STATUS.length === 5, "共 " + PROJ_STATUS.length + " 种（在营/预导入/暂停/停用/公共）");

  /* 找一个「有数据」和一个「没数据」的项目 */
  const withData = DB.projects.filter(p => !p.pub && projHasData(p.id));
  const noData = DB.projects.filter(p => !p.pub && !projHasData(p.id));
  P("  有数据项目：" + withData.map(p => p.id).join(",") + "　无数据项目：" + (noData.map(p => p.id).join(",") || "（无）"));
  ok(withData.length > 0, "至少有 1 个有数据的项目可用于测试");

  P("=== 2. 停用 + 无数据 → 归档，其他模块不显示 ===");
  if (!noData.length) {
    DB.projects.push({id: "P99", name: "空项目", client: "", status: "停用"});
    reset();
  }
  const emptyP = noData[0] || DB.projects.find(p => p.id === "P99");
  const oldStatus = emptyP.status;
  emptyP.status = "停用";
  reset();
  ok(isArchived(emptyP) === true, emptyP.id + " 停用且无明细 → 归档");
  ok(!activeProjects().some(p => p.id === emptyP.id), "activeProjects 不含它");
  ok(!bizProjects().some(p => p.id === emptyP.id), "bizProjects 不含它");

  P("=== 3. 合计口径不变（它本来就没数据）===");
  const before = periodAgg(period(), projSet()).d;
  reset();
  const after = periodAgg(period(), projSet()).d;
  ok(Math.abs(before.rev - after.rev) < 0.01 && Math.abs(before.profit - after.profit) < 0.01,
     "营收 " + Math.round(after.rev) + " / 利润 " + Math.round(after.profit) + " 不变");
  ok(projSet().indexOf(emptyP.id) >= 0, "projSet 仍是全部项目（藏的是展示，不是账）");

  P("=== 4. 停用 + 有数据 → 不归档，照常显示 ===");
  const dataP = withData[0];
  const dataStatus = dataP.status;
  dataP.status = "停用";
  reset();
  ok(isArchived(dataP) === false, dataP.id + " 有历史明细 → 不归档");
  ok(activeProjects().some(p => p.id === dataP.id), "仍在 activeProjects 里");
  ok(bizProjects().some(p => p.id === dataP.id), "仍在 bizProjects 里");

  P("=== 5. 暂停同规则；预导入 / 公共永不归档 ===");
  dataP.status = "暂停"; reset();
  ok(isArchived(dataP) === false, "暂停 + 有数据 → 照常显示");
  emptyP.status = "暂停"; reset();
  ok(isArchived(emptyP) === true, "暂停 + 无数据 → 归档");
  emptyP.status = "预导入"; reset();
  ok(isArchived(emptyP) === false, "预导入 → 永不归档");
  const pubP = DB.projects.find(p => p.pub);
  pubP.status = "停用"; reset();
  ok(isArchived(pubP) === false, "公共项目即使被改成停用也不归档：" + pubP.id);
  pubP.status = "公共"; reset();

  P("=== 6. 各模块都不再出现归档项目 ===");
  emptyP.status = "停用"; reset();
  renderCompare();
  const cmp = (_lastHTML["cmp"] && _lastHTML["cmp"].innerHTML) || "";
  ok(cmp.indexOf(emptyP.id) < 0, "项目对比树不含 " + emptyP.id);
  renderCost();
  const cost = (_lastHTML["cost"] && _lastHTML["cost"].innerHTML) || "";
  ok(cost.indexOf(emptyP.id) < 0, "成本分析项目对比不含 " + emptyP.id);
  renderAdjTable();
  const adj = (_lastHTML["tblAdj"] && _lastHTML["tblAdj"].innerHTML) || "";
  ok(adj.indexOf(emptyP.id) < 0, "预估增量表不含 " + emptyP.id);
  const opts = bizProjects().map(p => p.id);
  ok(opts.indexOf(emptyP.id) < 0 && opts.indexOf(dataP.id) >= 0,
     "项目下拉：" + opts.join(",") + "（含停用但有数据的 " + dataP.id + "）");

  P("=== 7. 项目表：状态筛选 ===");
  projFilter = "ALL";
  renderPanel();
  const allRows = ((_lastHTML["tblProj"] && _lastHTML["tblProj"].innerHTML) || "").split("<tr").length - 2;
  projFilter = "停用";
  renderPanel();
  const stopHtml = (_lastHTML["tblProj"] && _lastHTML["tblProj"].innerHTML) || "";
  const stopRows = stopHtml.split("<tr").length - 2;   /* 减掉 thead 那一行 */
  const stopCnt = DB.projects.filter(p => p.status === "停用").length;
  ok(stopRows === stopCnt, "筛选「停用」显示 " + stopRows + " 行 = 库里 " + stopCnt + " 个");
  ok(stopHtml.indexOf(emptyP.id) >= 0, "归档项目在「停用」筛选下仍可见（可改回来）");
  ok(allRows > stopRows, "全部（" + allRows + " 行）> 停用（" + stopRows + " 行）");

  projFilter = "预导入";

  renderPanel();
  ok(((_lastHTML["tblProj"].innerHTML) || "").indexOf("data-pk='proj'") < 0 ||
     (_lastHTML["tblProj"].innerHTML.indexOf(emptyP.id) < 0), "筛选「预导入」不含已改回停用的项目");

  projFilter = "ALL";
  renderPanel();
  const cap = (_lastHTML["projCap"] && _lastHTML["projCap"].textContent) || "";
  ok(cap.indexOf("在营") >= 0 && cap.indexOf("预导入") >= 0, "卡片副标题带各状态计数：" + cap.slice(0, 60));

  P("=== 8. 状态改回来，一切复原 ===");
  dataP.status = dataStatus;
  /* P99 是测试临时造的，直接移除 */
  DB.projects = DB.projects.filter(p => p.id !== "P99");
  reset();
  renderPanel();
  ok(!isArchived(dataP), dataP.id + " 恢复「" + dataP.status + "」后照常显示");
  ok(activeProjects().length === DB.projects.length, "没有归档项目时，activeProjects = 全部 " + DB.projects.length + " 个");
  ok(bizProjects().length === DB.projects.length - 1, "bizProjects 少掉公共项目 1 个");
  const back = periodAgg(period(), projSet()).d;
  ok(Math.abs(back.profit - before.profit) < 0.01, "合计仍未受影响：" + Math.round(back.profit));

  P("--- 完成 ---");
})();
