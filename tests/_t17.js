const P = (...a) => console.log(...a);
const ok = (c, m) => P((c ? "  OK   " : "  FAIL ") + m);

(async () => {
  await init();
  const Y = new Date().getFullYear();
  S.year = Y; S.type = "YTD"; S.project = "ALL";
  const reset = () => { _spillCache = {}; mCache = {}; _spreadMap = null; _lastDayCache = {}; };

  P("=== 1. 全仓视图：BP 折线必须画出来 ===");
  reset(); renderTrend();
  let h = (_lastHTML["trend"] && _lastHTML["trend"].innerHTML) || "";
  ok(h.indexOf("<polyline") >= 0, "有 BP 折线");
  const m = h.match(/points="([^"]+)"/);
  const n = m ? m[1].trim().split(/\s+/).length : 0;
  ok(n >= 2, "折线点数 " + n + "（≥2 才画线）");
  ok((h.match(/<circle /g) || []).length >= 2, "有 " + (h.match(/<circle /g) || []).length + " 个 BP 数据点");
  P("  " + (h.match(/实际营收[^<]*/g) || []).join(" | "));

  P("=== 2. 折线取值 = 仓级月 BP（不是 0）===");
  let bpSum = 0, bpN = 0, bpMax = 0;
  for (let i = 1; i <= 12; i++) {
    const b = bpOfMonth(Y + "-" + pad(i));
    if (b.rev) { bpSum += b.rev; bpN++; }
    if (Math.abs(b.rev) > bpMax) bpMax = Math.abs(b.rev);
  }
  ok(bpN > 0, "库里有 " + bpN + " 个月 BP，合计 " + Math.round(bpSum / 10000) + " 万");
  ok(n === bpN || n === bpN, "折线点数 " + n + " 与有 BP 的月数 " + bpN + " 一致");
  /* 折线必须落在画布内（y ∈ [12, 206]），否则说明 Y 轴没按 BP 缩放 */
  const ys = m ? m[1].trim().split(/\s+/).map(p => parseFloat(p.split(",")[1])) : [];
  const yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
  ok(yMin >= 11 && yMax <= 207, "折线 y 范围 " + yMin.toFixed(0) + "–" + yMax.toFixed(0) + " 落在画布内，最大 BP " + (bpMax / 10000).toFixed(1) + " 万");

  P("=== 3. 单项目视图不混画仓级 BP ===");
  S.project = "P01"; reset(); renderTrend();
  h = (_lastHTML["trend"] && _lastHTML["trend"].innerHTML) || "";
  ok(h.indexOf("<polyline") < 0, "单项目下面没有 BP 折线");
  const cap = (_lastHTML["trendCap"] && _lastHTML["trendCap"].textContent) || "";
  ok(cap.indexOf("仓级预算") >= 0, "副标题有说明：" + cap.slice(0, 70));
  S.project = "ALL";

  P("=== 4. BP 全空时不报错、不画线 ===");
  const bb = DB.bp; DB.bp = [];
  reset(); renderTrend();
  h = (_lastHTML["trend"] && _lastHTML["trend"].innerHTML) || "";
  ok(h.indexOf("<polyline") < 0, "没有 BP 就不画线");
  ok(h.indexOf("<svg") >= 0, "图本身照常渲染");
  DB.bp = bb;

  P("=== 5. 其它期间口径不炸 ===");
  let fail = [];
  ["YTD", "MTD", "M", "W"].forEach(ty => {
    try { S.type = ty; S.month = 11; S.week = 2; reset(); renderAll(); } catch (e) { fail.push(ty + ":" + e.message); }
  });
  ok(!fail.length, "四种期间都通过" + (fail.length ? "：" + fail.join("; ") : ""));
})();
