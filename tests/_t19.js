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

  P("=== 场景：营收比预算少、利润也比预算差（预算本身是亏损）===");
  DB.facts = []; DB.rent = {};
  DB.meta.rentDefault = 0; DB.meta.rentTotal = 0; DB.meta.entryCcy = "RMB";
  for (let m = 1; m <= 10; m++) {
    DB.facts.push({d: Y + "-" + pad(m) + "-01", p: "P01", a: "R02.01", v: 10000, src: "import"});
    DB.facts.push({d: Y + "-" + pad(m) + "-01", p: "P01", a: "C02.01.01", v: 20000, src: "import"});
  }
  DB.bp = [];
  for (let m = 1; m <= 12; m++) DB.bp.push({ym: Y + "-" + pad(m), rev: 12000, profit: -7000});
  reset(); renderGap();

  const h = (_lastHTML["gap"] && _lastHTML["gap"].innerHTML) || "";
  const d = periodAgg(period(), projSet()).d;
  const bpSame = bpRangeRMB(Y + "-01-01", latestDate());
  const bpM = bpSame.profit / bpSame.rev;
  const acM = d.profit / d.rev;
  const scale = (d.rev - bpSame.rev) * bpM;
  const eff = d.rev * (acM - bpM);

  P("  营收 " + d.rev + " vs BP " + Math.round(bpSame.rev) + "；利润率 " + (acM * 100).toFixed(1) + "% vs " + (bpM * 100).toFixed(1) + "%");
  P("  ① 规模差 " + scale.toFixed(0) + "　② 效率差 " + eff.toFixed(0));

  P("=== 1. 规模差为正（少做 + 预算利润率为负）===");
  ok(scale > 0, "① = " + scale.toFixed(0) + " > 0");

  P("=== 2. 效率差为负（利润率比预算更差）===");
  ok(acM < bpM && eff < 0, "② = " + eff.toFixed(0) + " < 0");

  P("=== 3. 两项恒等于「实际利润 − BP 利润」===");
  const proGap = d.profit - bpSame.profit;
  ok(Math.abs(scale + eff - proGap) < 1, "① + ② = " + (scale + eff).toFixed(0) + "，实际−BP = " + proGap.toFixed(0));

  P("=== 4. 页面上的符号与数值一致 ===");
  const attr = h.indexOf('<div class="gapattr">') >= 0
    ? h.slice(h.indexOf('<div class="gapattr">')).split("</div>")[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
    : "";
  const raw = h.slice(h.indexOf('<div class="gapattr">')).split("</div>")[0];
  const vals = (raw.match(/= <b>([^<]+)<\/b>/g) || []).map(s => s.replace(/= <b>|<\/b>/g, ""));
  ok(vals.length >= 2, "抓到两个结果：" + vals.join(" / "));
  ok(vals[0] && vals[0].charAt(0) === "+", "① 带正号：" + vals[0]);
  ok(vals[1] && vals[1].charAt(0) === "-", "② 带负号：" + vals[1]);
  ok(attr.indexOf("正数＝比预算好") >= 0, "标题写明了符号含义");
  P("  " + attr.slice(0, 200));

  P("=== 5. 恢复数据后回归 ===");
  DB.facts = bf; DB.bp = bb; DB.rent = br;
  DB.meta.rentDefault = bm.rentDefault; DB.meta.rentTotal = bm.rentTotal; DB.meta.entryCcy = bm.entryCcy;
  let fail = [];
  ["YTD", "MTD", "M", "W"].forEach(ty => {
    try { S.type = ty; S.month = 11; S.week = 2; reset(); renderAll(); } catch (e) { fail.push(ty + ":" + e.message); }
  });
  ok(!fail.length, "四种期间通过" + (fail.length ? "：" + fail.join("; ") : ""));
})();
