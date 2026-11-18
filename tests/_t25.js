const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; _projDataCache = null; };
  const ALLP = DB.projects.map(p => p.id);
  const bkFin = JSON.parse(JSON.stringify(DB.fin || []));
  DB.fin = [];
  reset();

  P("=== 1. 未录 ≠ 0 ===");
  ok(finOfMonth(Y + "-09") === null, "没录的月份返回 null（不是 0）");
  setFin(Y + "-09", "rev", 0);
  const z = finOfMonth(Y + "-09");
  ok(z && z.rev === 0, "填 0 就是 0：" + JSON.stringify(z));
  setFin(Y + "-09", "rev", "");
  ok(finOfMonth(Y + "-09") === null, "清空后又回到 null，空记录不留库");

  P("=== 2. 写入 / 清空 / 年度合计 ===");
  for (let m = 1; m <= 3; m++) {
    setFin(Y + "-" + pad(m), "rev", 100000 * m);
    setFin(Y + "-" + pad(m), "profit", 10000 * m);
  }
  const fy = finYearPair(Y);
  ok(Math.abs(fy.rev - 600000) < 0.01 && Math.abs(fy.profit - 60000) < 0.01,
     "1–3 月合计：营收 " + fy.rev.toLocaleString() + " / 净利 " + fy.profit.toLocaleString() + "（" + fy.n + " 个月）");
  setFin(Y + "-03", "profit", -5000);
  ok(finOfMonth(Y + "-03").rev === 300000 && finOfMonth(Y + "-03").profit === -5000,
     "只改利润不动营收：300,000 / -5,000");

  P("=== 3. 历史月：差额 = 管报 − 财报 ===");
  DB.fin = [];
  const m0 = 9, ym0 = Y + "-09";
  const ma = monthActual(ym0, ALLP);
  P("  管报 " + ym0 + "：营收 " + Math.round(ma.rev) + "　利润 " + Math.round(ma.profit));
  reset();
  setFin(ym0, "rev", ma.rev);              /* 营收一致 → 差额 0 */
  setFin(ym0, "profit", ma.profit + 50000); /* 财报多赚 5 万 → 管报 - 财报 = -5 万 */
  renderFinCmp();
  const h = (_lastHTML["finCmp"] && _lastHTML["finCmp"].innerHTML) || "";
  ok(h.indexOf("-¥5.0 万") >= 0, "利润差额显示 -¥5.0 万（管报比财报少赚 5 万）");
  ok(h.indexOf("9 月 同区间") >= 0, "KPI 标题标出同区间：" + (h.match(/[\d–]+ 月 同区间/g) || []).join(" / "));
  const sameCols = h.match(/同财报区间 (-?¥[\d.,]+ ?万?)/g) || [];
  ok(sameCols.length >= 2, "合计行营收/利润两列都给出同区间管报数：" + sameCols.join(" / "));
  const ma9 = monthActual(ym0, ALLP);
  ok(h.indexOf(fmtMoney(ma9.rev)) >= 0 && h.indexOf(fmtMoney(ma9.profit)) >= 0,
     "同区间值与管报该月数一致（营收 " + fmtMoney(ma9.rev) + " / 利润 " + fmtMoney(ma9.profit) + "）");

  P("=== 4. 历史月没录财报 → 差额留空，不参与可比 ===");
  DB.fin = [];
  reset();
  renderFinCmp();
  const h2 = (_lastHTML["finCmp"] && _lastHTML["finCmp"].innerHTML) || "";
  ok(h2.indexOf("待财报") >= 0, "未录的月份标「待财报」");
  ok(h2.indexOf("可比 无重叠月份") >= 0 || h2.indexOf("无重叠月份") >= 0, "可比区间为空时明确提示");
  ok(h2.indexOf("+¥") < 0 && h2.indexOf("-¥") < 0, "没有任何差额数字（不拿 0 冒充差额）");
  ok(h2.indexOf(">—<") >= 0, "差额列显示 —");

  P("=== 5. 当月用实际、未来月留空（预测只在时间进度树展示）===");
  renderFinCmp();
  const h3 = (_lastHTML["finCmp"] && _lastHTML["finCmp"].innerHTML) || "";
  ok(h3.indexOf("引管报预测") < 0, "当月不再标「引管报预测」");
  ok(h3.indexOf("管报预测") < 0, "未来月不再标「管报预测」");
  ok(h3.indexOf("尚未发生") >= 0, "未来月标「尚未发生」");
  const ld = latestActualDate();
  const curYm = ld.slice(0, 7);
  const maCur = monthActual(curYm, ALLP);
  ok(h3.indexOf(fmtMoney(maCur.profit)) >= 0, "当月显示实际值 " + fmtMoney(maCur.profit));
  ok(h3.indexOf("截至 ") >= 0, "当月注明「截至 N 日」");
  ok(h3.indexOf("直接引用管报预测") < 0, "说明文字不再写「引用管报预测」");

  P("=== 6. 财报不影响管报任何口径 ===");
  const before = periodAgg(period(), ALLP).d;
  setFin(Y + "-09", "rev", 99999999);
  const after = periodAgg(period(), ALLP).d;
  ok(Math.abs(before.rev - after.rev) < 0.01 && Math.abs(before.profit - after.profit) < 0.01,
     "录财报后管报 YTD 不变：" + Math.round(after.rev));
  const cmpRev = monthActual(Y + "-09", ALLP).rev;
  ok(Math.abs(cmpRev - ma.rev) < 0.01, "单月管报数也不受财报影响");

  P("=== 7. 仓级口径：切项目筛选不影响对比页 ===");
  DB.fin = [];
  setFin(ym0, "rev", 1000000);
  S.project = "P01";
  reset();
  renderFinCmp();
  const h4 = (_lastHTML["finCmp"] && _lastHTML["finCmp"].innerHTML) || "";
  S.project = "ALL";
  const capTxt = (_lastHTML["finCmpCap"] && _lastHTML["finCmpCap"].textContent) || "";
  ok(capTxt.indexOf("仓级全项目") >= 0, "副标题声明本页看全仓：" + capTxt.slice(0, 60));
  ok(h4.indexOf("¥100.0 万") >= 0, "仍显示财报原值 ¥100.0 万，没被项目筛选切走");
  const h5 = (_lastHTML["finCmp"] && _lastHTML["finCmp"].innerHTML) || "";
  ok(h5 === h4 || Math.abs((h5.match(/可比/g) || []).length - (h4.match(/可比/g) || []).length) === 0,
     "切到 P01 与切回 ALL 输出一致（本页不跟项目筛选）");

  P("=== 8. 存储往返 ===");
  const packed = packDB(DB);
  ok(Array.isArray(packed.fin) && packed.fin.length > 0, "packDB 带上财报数据（" + packed.fin.length + " 条）");
  const unpacked = unpackDB(JSON.parse(JSON.stringify(packed)));
  ok(Array.isArray(unpacked.fin), "unpackDB 读得回来");
  const oldPack = JSON.parse(JSON.stringify(packed));
  delete oldPack.fin;
  ok(Array.isArray(unpackDB(oldPack).fin) && unpackDB(oldPack).fin.length === 0, "老库没有 fin 字段时补空数组");

  DB.fin = bkFin;
  reset();
  P("--- 完成 ---");
})();
