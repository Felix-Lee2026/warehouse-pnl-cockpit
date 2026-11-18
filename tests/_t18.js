const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.project = "ALL"; S.type = "YTD";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; };
  const bf = JSON.parse(JSON.stringify(DB.facts));
  const bb = JSON.parse(JSON.stringify(DB.bp));
  const br = JSON.parse(JSON.stringify(DB.rent));
  const bm = {rentDefault: DB.meta.rentDefault, rentTotal: DB.meta.rentTotal, entryCcy: DB.meta.entryCcy};

  P("=== 1. 场景：1-10 月每月亏 1 万，预算允许每月亏 0.7 万 ===");
  DB.facts = []; DB.rent = {};
  DB.meta.rentDefault = 0; DB.meta.rentTotal = 0;
  DB.meta.entryCcy = "RMB";
  for (let m = 1; m <= 10; m++) {
    DB.facts.push({d: Y + "-" + pad(m) + "-01", p: "P01", a: "R02.01", v: 10000, src: "import"});
    DB.facts.push({d: Y + "-" + pad(m) + "-01", p: "P01", a: "C02.01.01", v: 20000, src: "import"});
  }
  DB.bp = [];
  for (let m = 1; m <= 12; m++) DB.bp.push({ym: Y + "-" + pad(m), rev: 12000, profit: -7000});
  reset(); renderGap();

  const h = (_lastHTML["gap"] && _lastHTML["gap"].innerHTML) || "";
  const txt = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const d = periodAgg(period(), projSet()).d;
  const bpY = yearBpTotals(Y);
  const rate = achRate(d.profit, bpY.profit);
  P("  实际利润 " + Math.round(d.profit) + "，年度 BP " + Math.round(bpY.profit) +
    "，期望达成 " + (rate * 100).toFixed(1) + "%");
  ok(rate < 1, "亏损超预算 → 达成低于 100%（" + (rate * 100).toFixed(1) + "%）");

  P("=== 2. 卡片里的两个数一致，且不再是 实际÷BP ===");
  ok(txt.indexOf("达成 " + fmtPct(rate)) >= 0, "出现「达成 " + fmtPct(rate) + "」");
  ok(txt.indexOf("已达成") < 0, "不再出现「已达成」");
  const all = txt.match(/达成 [\-\d.]+%/g) || [];
  const rRev = "达成 " + fmtPct(achRate(d.rev, bpY.rev));
  const rPro = "达成 " + fmtPct(rate);
  const uniq = [...new Set(all)].sort();
  ok(uniq.length === 2 && uniq.indexOf(rRev) >= 0 && uniq.indexOf(rPro) >= 0,
     "每列只有一个达成值（营收 " + rRev + " / 利润 " + rPro + "）：" + all.join(" / "));
  ok(!/达成 1[0-9]{2}\.\d%/.test(txt), "没有 >100% 的达成");
  P("  卡片：" + txt.slice(0, 140));

  P("=== 3. 进度条跟着达成走 ===");
  const widths = (h.match(/gapbar"><i style="width:([\d.]+)%/g) || [])
    .map(s => parseFloat(s.match(/width:([\d.]+)/)[1]));
  ok(widths.length === 2, "两根进度条：" + widths.join(" / "));
  ok(widths.every(w => w <= 100), "宽度均 ≤100%");

  P("=== 4. 盈利预算不受影响 ===");
  DB.bp = bb.map(b => ({ym: b.ym, rev: b.rev, profit: Math.abs(b.profit || 1)}));
  reset(); renderGap();
  const t2 = ((_lastHTML["gap"] && _lastHTML["gap"].innerHTML) || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  ok(t2.indexOf("全年还差") >= 0, "盈利预算仍用「全年还差」");
  ok(t2.indexOf("达成") >= 0, "有达成");

  P("=== 5. 恢复数据后回归 ===");
  DB.facts = bf; DB.bp = bb; DB.rent = br;
  DB.meta.rentDefault = bm.rentDefault; DB.meta.rentTotal = bm.rentTotal; DB.meta.entryCcy = bm.entryCcy;
  let fail = [];
  ["YTD", "MTD", "M", "W"].forEach(ty => {
    try { S.type = ty; S.month = 11; S.week = 2; reset(); renderAll(); } catch (e) { fail.push(ty + ":" + e.message); }
  });
  ok(!fail.length, "四种期间通过" + (fail.length ? "：" + fail.join("; ") : ""));
})();
