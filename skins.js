"use strict";
// 外形タブ: 外形をシリーズごとにまとめ、パーツごとに「どの装備を分解（抽出）すると手に入るか」と入手場所を出す。
// 収集済みのパーツは state.skins（解放アイテムのページ名 → true）に保存する。app.js のあとに読み込む。

const SKIN_KIND = { armor: "防具", weapon: "武器", accessory: "アクセサリー", other: "その他" };
const GEAR_SHOWN = 3; // パーツごとに最初から見せる装備の数

let SKINS = null;
const skinUi = { kinds: new Set(), loading: null };

function loadSkins() {
  skinUi.loading ||= fetch("data/skins.json")
    .then((r) => r.json())
    .then((d) => {
      SKINS = d;
      // 種類ごとに、日本語名のシリーズを先、英語名のみのシリーズを後ろに
      const kindOrder = Object.keys(SKIN_KIND);
      d.series.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || a.english - b.english || a.name.localeCompare(b.name, "ja"));
      for (const s of d.series) {
        // 回って集めやすいよう、ドロップ場所がわかっている装備を先に
        for (const p of s.parts) p.gear.sort((a, b) => !a.where - !b.where || (a.level || 0) - (b.level || 0));
        // 検索用の文字列をまとめておく
        s.hay = [s.name, s.where, s.otherSources, ...s.parts.flatMap((p) => [p.name, ...p.gear.flatMap((g) => [g.name, g.nameEn, g.where, ...g.via])])]
          .filter(Boolean).join(" ").toLowerCase();
      }
    });
  return skinUi.loading;
}

const skinDone = (p) => !!state.skins[p.item];

function seriesProgress(s) {
  const done = s.parts.filter(skinDone).length;
  return { done, total: s.parts.length };
}

function gearLine(g) {
  const name = g.url ? `<a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.name)}</a>` : esc(g.name);
  const via = g.via.map((v) => `<span class="tag">${esc(v)}</span>`).join("");
  const icon = g.icon ? `<img class="gear-icon" src="${esc(g.icon)}" alt="" loading="lazy">` : "";
  return `<li>${icon}<div>${name}${g.level ? ` <span class="muted">Lv.${g.level}</span>` : ""} ${via}
    ${g.nameEn ? '<span class="muted en-note" title="日本語名を取得できなかった新しい装備です（公式サイトの英語名）">英語名</span>' : ""}
    ${g.where ? `<div class="where">${esc(g.where)}</div>` : ""}</div></li>`;
}

function partRow(s, p) {
  const gear = p.gear;
  const shown = gear.slice(0, GEAR_SHOWN).map(gearLine).join("");
  const rest = gear.length > GEAR_SHOWN
    ? `<details class="more"><summary>ほか ${gear.length - GEAR_SHOWN}件の装備</summary><ul class="gear">${gear.slice(GEAR_SHOWN).map(gearLine).join("")}</ul></details>`
    : "";
  return `<li class="skin-part ${skinDone(p) ? "done" : ""}">
    <label class="got"><input type="checkbox" class="skin-check" data-item="${esc(p.item)}" ${skinDone(p) ? "checked" : ""}>
      <span class="part-name">${esc(p.name)}</span></label>
    ${gear.length
      ? `<div class="gear-head">分解（抽出）で手に入る装備</div><ul class="gear">${shown}</ul>${rest}`
      : `<div class="muted no-gear">装備からは手に入りません（シリーズの入手方法を参照）</div>`}
  </li>`;
}

function seriesBody(s) {
  const how = [s.where, s.otherSources && `その他の入手方法: ${s.otherSources}`].filter(Boolean);
  return `${how.length ? `<p class="series-how">${how.map(esc).join("<br>")}</p>` : ""}
    <ul class="skin-parts">${s.parts.map((p) => partRow(s, p)).join("")}</ul>
    <p class="muted"><a href="${esc(s.url)}" target="_blank" rel="noopener">MetaBot.GG で詳細・3Dモデルを見る</a></p>`;
}

// シリーズの主な入手場所（装備のドロップ先のダンジョン名など。なければ入手経路の大分類）
function seriesPlaces(s) {
  const count = new Map();
  const add = (k) => k && count.set(k, (count.get(k) || 0) + 1);
  for (const p of s.parts)
    for (const g of p.gear) {
      const m = g.where.match(/は(.+?)でドロップします/) || g.where.match(/おすすめの狩り場は(.+?)の/);
      if (m) add(m[1].split(/[,、]/)[0].trim());
      else g.via.forEach(add);
    }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function seriesCard(s) {
  const { done, total } = seriesProgress(s);
  const fromGear = s.parts.some((p) => p.gear.length);
  return `<details class="skin-series ${done === total ? "complete" : ""}" data-key="${esc(s.key)}">
    <summary>
      <span class="series-name">${esc(s.name)}</span>
      <span class="tag">${SKIN_KIND[s.kind] || ""}</span>
      ${s.grade ? `<span class="tag">${esc(s.grade)}</span>` : ""}
      ${fromGear ? "" : '<span class="tag">装備からは出ない</span>'}
      ${s.english ? '<span class="tag" title="日本語名を取得できなかった新しい外形です（公式サイトの英語名）">英語名</span>' : ""}
      <span class="series-progress">${done} / ${total}</span>
      ${(() => { const pl = seriesPlaces(s); return pl.length ? `<span class="series-places">入手: ${esc(pl.slice(0, 3).join(" ・ "))}${pl.length > 3 ? " ほか" : ""}</span>` : (s.otherSources || s.where ? `<span class="series-places">${esc(s.otherSources || s.where)}</span>` : ""); })()}
    </summary>
    <div class="series-body"></div>
  </details>`;
}

function filteredSeries() {
  const q = $("#skin-q").value.trim().toLowerCase();
  const onlyTodo = $("#skin-todo").checked;
  const how = document.querySelector('input[name="skin-how"]:checked').value;
  return SKINS.series.filter((s) => {
    if (skinUi.kinds.size && !skinUi.kinds.has(s.kind)) return false;
    if (onlyTodo && seriesProgress(s).done === s.parts.length) return false;
    const fromGear = s.parts.some((p) => p.gear.length);
    if (how === "gear" && !fromGear) return false;
    if (how === "other" && fromGear) return false;
    if (q && !q.split(/\s+/).every((w) => s.hay.includes(w))) return false;
    return true;
  });
}

function renderSkinSummary() {
  const parts = SKINS.series.flatMap((s) => s.parts);
  const done = parts.filter(skinDone).length;
  const complete = SKINS.series.filter((s) => seriesProgress(s).done === s.parts.length).length;
  $("#skin-summary").textContent = `収集済み ${done} / ${parts.length} パーツ ・ シリーズ完成 ${complete} / ${SKINS.series.length}`;
}

async function renderSkins() {
  if (!SKINS) {
    $("#skin-list").innerHTML = '<p class="empty">読み込んでいます…</p>';
    try {
      await loadSkins();
    } catch (e) {
      $("#skin-list").innerHTML = `<p class="empty">外形データを読み込めませんでした（${esc(e.message)}）。</p>`;
      return;
    }
  }
  $("#skin-kinds").innerHTML = Object.entries(SKIN_KIND).filter(([k]) => SKINS.series.some((s) => s.kind === k))
    .map(([k, v]) => `<button type="button" class="chip" data-kind="${k}" aria-pressed="${skinUi.kinds.has(k)}">${v}</button>`).join("");
  renderSkinSummary();
  const list = filteredSeries();
  $("#skin-count").textContent = `${list.length}シリーズ`;
  $("#skin-list").innerHTML = list.length ? list.map(seriesCard).join("") : '<p class="empty">該当するシリーズはありません。</p>';
}

function bindSkins() {
  const list = $("#skin-list");
  // 開いたときに中身を作る（全シリーズ分を最初から作ると重い）
  list.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!d.classList?.contains("skin-series") || !d.open) return;
    const body = d.querySelector(".series-body");
    if (!body.childElementCount) body.innerHTML = seriesBody(SKINS.series.find((s) => s.key === d.dataset.key));
  }, true);
  list.addEventListener("change", (e) => {
    if (!e.target.classList.contains("skin-check")) return;
    const item = e.target.dataset.item;
    if (e.target.checked) state.skins[item] = true;
    else delete state.skins[item];
    saveState();
    e.target.closest(".skin-part").classList.toggle("done", e.target.checked);
    const card = e.target.closest(".skin-series");
    const s = SKINS.series.find((x) => x.key === card.dataset.key);
    const { done, total } = seriesProgress(s);
    card.querySelector(".series-progress").textContent = `${done} / ${total}`;
    card.classList.toggle("complete", done === total);
    renderSkinSummary();
  });
  $("#skin-kinds").addEventListener("click", (e) => {
    const k = e.target.closest(".chip")?.dataset.kind;
    if (!k) return;
    skinUi.kinds.has(k) ? skinUi.kinds.delete(k) : skinUi.kinds.add(k);
    renderSkins();
  });
  $("#skin-q").addEventListener("input", renderSkins);
  $("#skin-todo").addEventListener("change", renderSkins);
  document.querySelectorAll('input[name="skin-how"]').forEach((r) => r.addEventListener("change", renderSkins));
}
