const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; };
  reset();

  P("=== 1. 成本分桶：五桶互斥，相加 = 总成本 ===");
  const ALLP = DB.projects.map(x => x.id);
  const tot = periodAgg(period(), ALLP);
  const B = costBuckets(tot.acc);
  const five = B.rent + B.labor + B.mat + B.dep + B.misc;
  ok(Math.abs(five - B.total) < 0.01, "仓租+总人力+耗材+折旧+杂费 = " + Math.round(five) + "，总成本 " + Math.round(B.total));
  ok(Math.abs(B.rent - (B.rentSelf + B.spill)) < 0.01, "仓租 = 项目承担 " + Math.round(B.rentSelf) + " + 溢出 " + Math.round(B.spill));

  P("=== 2. 固定成本 = 仓租 + 固定人力 + 折旧 ===");
  ok(Math.abs(B.fixed - (B.rent + B.fixedLabor + B.dep)) < 0.01,
     "固定成本 " + Math.round(B.fixed) + " = " + Math.round(B.rent) + " + " + Math.round(B.fixedLabor) + " + " + Math.round(B.dep));
  ok(B.fixed <= B.total + 0.01, "固定成本不超过总成本");

  P("=== 3. 外包人力 ⊂ 总人力 ===");
  ok(B.outsrc > 0 && B.outsrc <= B.labor + 0.01, "外包 " + Math.round(B.outsrc) + " ≤ 总人力 " + Math.round(B.labor));

  P("=== 4. 溢出只进仓级，不进子项目 ===");
  const p1 = DB.projects.find(x => !x.pub);
  const one = periodAgg(period(), [p1.id]);
  const b1 = costBuckets(one.acc);
  ok(Math.abs(b1.spill) < 0.01, "单项目 " + p1.id + " 的溢出 = " + b1.spill.toFixed(2) + "（应为 0）");
  ok(B.spill > 0, "仓级溢出 " + Math.round(B.spill) + " > 0");
  const sp = computeRentSpill(period().from, period().to, false);
  ok(Math.abs(B.spill - sp.spill) < 1, "仓级溢出与 computeRentSpill 一致（" + Math.round(sp.spill) + "）");

  P("=== 5. 各项目成本占比 + P000 余量 ≈ 100% ===");
  let sum = 0;
  DB.projects.filter(x => !x.pub && x.status !== "停用").forEach(pr => {
    sum += costBuckets(periodAgg(period(), [pr.id]).acc).total;
  });
  ok(Math.abs(sum + B.spill - B.total) < Math.max(1, B.total * 0.01),
     "项目成本合计 " + Math.round(sum) + " + 溢出 " + Math.round(B.spill) + " ≈ 总成本 " + Math.round(B.total));

  P("=== 6. 页面渲染 ===");
  let err = null;
  try { renderCost(); } catch (e) { err = e.message; }
  ok(!err, "renderCost 无异常" + (err ? "：" + err : ""));
  const h = (_lastHTML["cost"] && _lastHTML["cost"].innerHTML) || "";
  ok(h.indexOf("1 元营收拆解") >= 0, "有拆解表");
  ok(h.indexOf("项目对比") >= 0, "有项目对比表");
  ok(h.indexOf("空置与成本占比") >= 0, "有空置占比");
  ok(h.indexOf("营收结构") >= 0, "有营收结构");
  ok(h.indexOf("每 1 元营收") >= 0, "有每 1 元营收列");
  ok(h.indexOf("P000") >= 0 || h.indexOf("空置仓租") >= 0, "有空置说明");

  P("=== 7. 顶部切项目必须跟随（曾固定看全仓，与右下阶梯自相矛盾）===");
  const kpiOf = () => {
    renderCost();
    const t = (_lastHTML["cost"].innerHTML || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    return (t.match(/每 1 元营收成本 ([\d.]+)/) || [])[1];
  };
  S.project = "ALL"; reset(); const vAll = kpiOf();
  S.project = p1.id; reset(); const vOne = kpiOf();
  ok(vAll && vOne && vAll !== vOne, "切到 " + p1.id + " 后指标变化：" + vAll + " → " + vOne);
  // 单项目口径必须等于手算
  const mOne = costBuckets(periodAgg(period(), [p1.id]).acc);
  const mRev = periodAgg(period(), [p1.id]).d.rev;
  const manOne = (mOne.total / mRev).toFixed(2);
  ok(vOne === manOne, "单项目每 1 元营收成本 " + vOne + " = 手算 " + manOne);
  // 口径说明要写明当前范围，且不得再说"固定看全仓"
  const capTxt = (document.getElementById("costCap") || {}).textContent || "";
  ok(capTxt.indexOf(p1.name) >= 0, "口径说明写明范围：" + capTxt.slice(0, 50));
  ok(capTxt.indexOf("固定看全仓") < 0, "不再声称固定看全仓");
  ok(capTxt.indexOf("不含 P000") >= 0, "项目视角注明不含空置与公摊");
  // 仓级视角仍带空置说明
  S.project = "ALL"; reset(); renderCost();
  const capAll = (document.getElementById("costCap") || {}).textContent || "";
  ok(capAll.indexOf("全仓") >= 0 && capAll.indexOf("不含 P000") < 0, "仓级视角不提示「不含空置」");
  const htmlAll = (_lastHTML["cost"].innerHTML || "");
  ok(htmlAll.indexOf("含空置") >= 0, "仓级视角仓租行标注「含空置」");
  S.project = p1.id; reset(); renderCost();
  const htmlOne = (_lastHTML["cost"].innerHTML || "");
  ok(htmlOne.indexOf("不含空置（记 P000）") >= 0 || htmlOne.indexOf("（不含空置）") >= 0,
     "项目视角标注「不含空置」");
  S.project = "ALL";

  P("=== 8. 期间切换 ===");
  let fail = [];
  ["YTD", "MTD", "M", "W"].forEach(ty => {
    try { S.type = ty; S.month = 11; S.week = 1; reset(); renderCost(); } catch (e) { fail.push(ty + ":" + e.message); }
  });
  ok(!fail.length, "四种期间都渲染成功" + (fail.length ? "：" + fail.join("; ") : ""));
})();
