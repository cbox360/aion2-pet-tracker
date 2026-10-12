"use strict";

// ---------------------------------------------------------------- 定数

const STORE_KEY = "aion2-pet-tracker:v1";
const METABOT = "https://metabot.gg/ja_JP/aion-2";

const TYPES = [
  { id: "fera", name: "野性" },
  { id: "natura", name: "自然" },
  { id: "varian", name: "変形" },
  { id: "cogni", name: "知性" },
  { id: "special", name: "特殊" },
];
const TYPE_NAME = Object.fromEntries(TYPES.map((t) => [t.id, t.name]));
const TYPE_COLOR = { fera: "#e0894b", natura: "#6cc56c", varian: "#b77be8", cogni: "#5aa6e6", special: "#d9b45a" };

// tiles: 元タイル数（aion2-interactive-map の maps.yaml）。座標 0..1 は 2 の累乗に切り上げた正方形が基準。
// MetaBot の全体図から作ったワールドは正方形全体を使うので [1, 1]。zoom は site/tiles の最大ズーム。
const WORLDS = {
  world_l_a: { tiles: [8, 8], zoom: 4, faction: "light", order: 1 },
  world_l_b: { tiles: [1, 1], zoom: 3, faction: "light", order: 2 },
  world_d_a: { tiles: [8, 8], zoom: 4, faction: "dark", order: 1 },
  world_d_b: { tiles: [1, 1], zoom: 3, faction: "dark", order: 2 },
  abyss_reshanta_a: { tiles: [4, 4], zoom: 4, faction: "abyss", order: 10 },
  abyss_reshanta_c: { tiles: [1, 1], zoom: 1, faction: "abyss", order: 11 },
  abyss_reshanta_d: { tiles: [1, 1], zoom: 1, faction: "abyss", order: 12 },
};
// 湧き点の距離計算用: 1 ワールド全体の大きさ（元タイル 1024px 換算）
const WORLD_PX = { world_l_a: 8192, world_l_b: 8192, world_d_a: 8192, world_d_b: 8192, abyss_reshanta_a: 4096, abyss_reshanta_c: 2048, abyss_reshanta_d: 2048 };
const FACTION_NAME = { light: "天族", dark: "魔族" };

const worldSide = (w) => {
  const n = Math.max(...(WORLDS[w]?.tiles || [8, 8]));
  let s = 1;
  while (s < n) s *= 2;
  return s;
};
const worldFaction = (w) => WORLDS[w]?.faction || (w.startsWith("world_l") ? "light" : w.startsWith("world_d") ? "dark" : "abyss");
const inFaction = (w, f) => {
  const wf = worldFaction(w);
  return wf === f || wf === "abyss";
};

// ---------------------------------------------------------------- 状態

let DATA = null;
let state = loadState();
const ui = { tab: "pets", typeFilter: new Set(), mapFocus: null, world: null };

function loadState() {
  const empty = { faction: "light", souls: {}, typeLv: {} };
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && typeof s === "object") return { ...empty, ...s };
  } catch (_) { /* 保存できない環境では初期状態で動かす */ }
  return empty;
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* noop */ }
}

const soulsOf = (p) => Math.min(state.souls[p.slug] || 0, p.souls);
const isDone = (p) => soulsOf(p) >= p.souls;
const remaining = (p) => p.souls - soulsOf(p);

// ---------------------------------------------------------------- データ整形

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const mapNameToWorld = {};
const worldName = {};

function prepare(data) {
  // 地図名 ⇔ ワールド ID の対応は湧き図のラベル（「アルトガルドマップの…」）から得る
  for (const m of Object.values(data.monsters)) {
    for (const sm of m.spawnMaps) {
      const name = sm.label.split("マップの")[0];
      if (name) {
        mapNameToWorld[name] = sm.world;
        worldName[sm.world] = name;
      }
    }
  }
  for (const m of Object.values(data.monsters)) {
    m.pets = [];
    for (const z of m.zones) z.world = mapNameToWorld[z.map] || null;
  }
  for (const p of data.pets) {
    if (!TYPE_NAME[p.type]) p.type = "special";
    p.drops = p.drops.filter((d) => data.monsters[d.monster]);
    for (const d of p.drops) {
      const m = data.monsters[d.monster];
      if (!m.pets.some((x) => x.pet === p)) m.pets.push({ pet: p, chance: d.chance });
    }
  }
  data.pets.sort((a, b) => TYPES.findIndex((t) => t.id === a.type) - TYPES.findIndex((t) => t.id === b.type) || a.name.localeCompare(b.name, "ja"));
  return data;
}

// モンスターが選択陣営で湧くか（湧き図・ゾーン表のどちらかで判定）
function monsterInFaction(m, f) {
  return m.spawnMaps.some((s) => inFaction(s.world, f)) || m.zones.some((z) => z.world && inFaction(z.world, f));
}
const petAvailable = (p, f) => p.drops.some((d) => monsterInFaction(DATA.monsters[d.monster], f));

// ---------------------------------------------------------------- ヘッダー・タブ

function renderHeader() {
  const done = DATA.pets.filter(isDone).length;
  const avail = DATA.pets.filter((p) => petAvailable(p, state.faction));
  const availDone = avail.filter(isDone).length;
  $("#progress").textContent = `獲得 ${done} / ${DATA.pets.length} ・ ${FACTION_NAME[state.faction]}で魂が出るペット ${availDone} / ${avail.length}`;
  document.querySelectorAll(".faction button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.faction === state.faction)));
}

function showTab(tab) {
  ui.tab = tab;
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== `tab-${tab}`));
  if (tab === "pets") renderPets();
  if (tab === "spots") renderSpots();
  if (tab === "map") renderMap();
  if (tab === "data") $("#backup").value = "";
}

function renderAll() {
  renderHeader();
  showTab(ui.tab);
}

// ---------------------------------------------------------------- 図鑑

function renderTypeLevels() {
  const box = $("#typelv");
  box.innerHTML = TYPES.map((t) => {
    const owned = DATA.pets.filter((p) => p.type === t.id && isDone(p)).length;
    const total = DATA.pets.filter((p) => p.type === t.id).length;
    return `<label><span class="dot bg-${t.id}"></span>${t.name} Lv
      <input type="number" min="1" max="10" data-type="${t.id}" value="${esc(state.typeLv[t.id] || "")}" placeholder="-">
      <span class="cnt">${owned}/${total}</span></label>`;
  }).join("");
}

function renderTypeChips() {
  $("#type-chips").innerHTML = TYPES.map(
    (t) => `<button type="button" class="chip t-${t.id}" data-type="${t.id}" aria-pressed="${ui.typeFilter.has(t.id)}">${t.name}</button>`
  ).join("");
}

function zoneSummary(m) {
  const f = state.faction;
  return m.zones
    .map((z) => ({ ...z, off: z.world && !inFaction(z.world, f) }))
    .sort((a, b) => a.off - b.off || b.spawns - a.spawns);
}

function petCard(p) {
  const have = soulsOf(p);
  const pips = Array.from({ length: p.souls }, (_, i) =>
    `<button type="button" class="pip ${i < have ? "on" : ""}" data-pet="${esc(p.slug)}" data-n="${i + 1}" aria-label="魂 ${i + 1} 個"></button>`
  ).join("");
  const drops = p.drops
    .map((d) => {
      const m = DATA.monsters[d.monster];
      const off = !monsterInFaction(m, state.faction);
      const zones = zoneSummary(m)
        .map((z) => `<span class="${z.off ? "off" : ""}">${esc(z.name)}（${esc(z.map)}・${z.spawns}）</span>`)
        .join("、");
      return `<li class="${off ? "off" : ""}">
        <a href="${METABOT}/monsters/${esc(m.slug)}" target="_blank" rel="noopener">${esc(m.name)}</a>
        Lv.${m.level ?? "?"} ${m.rank && m.rank !== "ノーマル" ? `<span class="tag">${esc(m.rank)}</span>` : ""}
        ${d.chance != null && d.chance < 100 ? `<span class="tag">${d.chance}%</span>` : ""}
        <div class="where">${zones || "湧き情報なし（ダンジョン等）"}</div>
        ${m.spawnMaps.some((s) => s.points.length) && !off ? `<button type="button" class="linkbtn" data-map-monster="${esc(m.slug)}">マップで見る</button>` : ""}
      </li>`;
    })
    .join("");
  const otherKeys = { quest: "クエスト", box: "ボックス", other: "その他" };
  const others = Object.entries(p.sources || {})
    .filter(([k]) => otherKeys[k])
    .map(([k, n]) => `${otherKeys[k]} ${n}件`)
    .join("・");
  return `<article class="pet ${isDone(p) ? "done" : ""}">
    <div class="pet-head">
      <a class="pet-name" href="${METABOT}/mounts/${esc(p.slug)}" target="_blank" rel="noopener">${esc(p.name)}</a>
      <span class="pet-type t-${p.type}">${TYPE_NAME[p.type]}</span>
    </div>
    <div class="pips">${pips}<span class="pip-label">${isDone(p) ? "獲得済み" : `あと ${remaining(p)}`}</span></div>
    <details>
      <summary>魂を落とすモンスター（${p.drops.length}）</summary>
      <ul class="drops">${drops || '<li class="other">モンスタードロップなし</li>'}
        ${others ? `<li class="other">ほかの入手方法: ${others}（<a href="${METABOT}/mounts/${esc(p.slug)}" target="_blank" rel="noopener">詳細</a>）</li>` : ""}
      </ul>
    </details>
  </article>`;
}

function renderPets() {
  renderTypeLevels();
  renderTypeChips();
  const q = $("#q").value.trim().toLowerCase();
  const onlyTodo = $("#only-todo").checked;
  const onlyFaction = $("#only-faction").checked;
  const list = DATA.pets.filter((p) => {
    if (onlyTodo && isDone(p)) return false;
    if (ui.typeFilter.size && !ui.typeFilter.has(p.type)) return false;
    if (onlyFaction && !petAvailable(p, state.faction)) return false;
    if (q) {
      const hay = [p.name, p.slug, ...p.drops.map((d) => DATA.monsters[d.monster].name)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  $("#pets").innerHTML = list.length ? list.map(petCard).join("") : '<p class="empty">該当するペットはありません。</p>';
}

// ---------------------------------------------------------------- 狩場の計算

// 未完了ペットの魂を落とすモンスターの湧き点（選択陣営で行けるワールドのみ）
function targetPoints() {
  const byWorld = {};
  for (const m of Object.values(DATA.monsters)) {
    const pets = m.pets.filter((x) => !isDone(x.pet));
    if (!pets.length) continue;
    for (const sm of m.spawnMaps) {
      if (!inFaction(sm.world, state.faction)) continue;
      const arr = (byWorld[sm.world] ||= []);
      for (const [x, y] of sm.points) arr.push({ x, y, m, pets });
    }
  }
  return byWorld;
}

// 範囲内の「狙える未完了ペットの種類数」が多い地点を、重ならないように選ぶ
function computeHotspots(radiusPx, limit = 12) {
  const result = [];
  for (const [world, pts] of Object.entries(targetPoints())) {
    const r = radiusPx / (WORLD_PX[world] || 8192);
    const cell = r;
    const grid = new Map();
    const key = (cx, cy) => cx + "," + cy;
    pts.forEach((p, i) => {
      const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    });
    const near = (p) => {
      const out = [];
      const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const j of grid.get(key(cx + dx, cy + dy)) || []) {
            const q = pts[j];
            if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= r * r) out.push(q);
          }
      return out;
    };
    const cands = pts.map((p) => {
      const ns = near(p);
      const pets = new Set();
      const mons = new Set();
      for (const q of ns) { mons.add(q.m); for (const x of q.pets) pets.add(x.pet); }
      return { world, x: p.x, y: p.y, ns, pets, mons, score: pets.size * 1000 + ns.length };
    });
    cands.sort((a, b) => b.score - a.score);
    const picked = [];
    for (const c of cands) {
      if (picked.length >= limit) break;
      if (picked.some((p) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < (2 * r) ** 2)) continue;
      // 重心に寄せる
      c.x = c.ns.reduce((s, q) => s + q.x, 0) / c.ns.length;
      c.y = c.ns.reduce((s, q) => s + q.y, 0) / c.ns.length;
      c.r = r;
      picked.push(c);
    }
    result.push(...picked);
  }
  result.sort((a, b) => b.pets.size - a.pets.size || b.ns.length - a.ns.length);
  return result.slice(0, limit);
}

function mainZone(mons) {
  const count = {};
  for (const m of mons) {
    const z = zoneSummary(m).find((z) => !z.off);
    if (z) count[z.name] = (count[z.name] || 0) + 1;
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 2).join(" / ");
}

function levelRange(mons) {
  const lv = [...mons].map((m) => m.level).filter((x) => x != null);
  if (!lv.length) return "";
  const lo = Math.min(...lv), hi = Math.max(...lv);
  return lo === hi ? `Lv.${lo}` : `Lv.${lo}〜${hi}`;
}

function petTags(pets) {
  return [...pets]
    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
    .map((p) => `<span class="tag"><span class="dot bg-${p.type}"></span> ${esc(p.name)} あと${remaining(p)}</span>`)
    .join("");
}

function renderSpots() {
  const radius = +$("#radius").value;
  $("#radius-label").textContent = radius <= 100 ? "狭い" : radius >= 250 ? "広い" : "ふつう";
  const spots = computeHotspots(radius);
  $("#hotspots").innerHTML = spots.length
    ? spots.map((s, i) => `<li>
        <div class="spot-title">
          <strong>${esc(mainZone(s.mons) || "不明なゾーン")}</strong>
          <span class="spot-meta">${esc(worldName[s.world] || s.world)} ・ ペット${s.pets.size}種 ・ 湧き${s.ns.length}か所 ・ ${levelRange(s.mons)}</span>
          <button type="button" class="linkbtn" data-map-spot="${i}">マップで見る</button>
        </div>
        <div class="tags">${petTags(s.pets)}</div>
      </li>`).join("")
    : '<p class="empty">この陣営で狙える未完了ペットはありません。</p>';
  ui.lastSpots = spots;

  // ゾーン別集計
  const zones = {};
  for (const m of Object.values(DATA.monsters)) {
    const pets = m.pets.filter((x) => !isDone(x.pet)).map((x) => x.pet);
    if (!pets.length) continue;
    for (const z of m.zones) {
      if (!z.world || !inFaction(z.world, state.faction)) continue;
      const e = (zones[z.zone] ||= { name: z.name, map: z.map, pets: new Set(), mons: new Set(), spawns: 0 });
      pets.forEach((p) => e.pets.add(p));
      e.mons.add(m);
      e.spawns += z.spawns || 0;
    }
  }
  const rows = Object.values(zones).sort((a, b) => b.pets.size - a.pets.size || b.spawns - a.spawns);
  $("#zones").innerHTML = `<thead><tr><th>ゾーン</th><th>地図</th><th>ペット</th><th>湧き数</th><th>レベル</th><th>狙えるペット</th></tr></thead><tbody>` +
    rows.map((z) => `<tr><td>${esc(z.name)}</td><td>${esc(z.map)}</td><td class="n">${z.pets.size}</td><td class="n">${z.spawns}</td><td class="n">${levelRange(z.mons)}</td><td><div class="tags">${petTags(z.pets)}</div></td></tr>`).join("") +
    "</tbody>";
}

// ---------------------------------------------------------------- マップ

let map = null;
let tileLayer = null;
let pointLayer = null;
let hotLayer = null;

const toLatLng = (x, y) => [-y * 256, x * 256];

function availableWorlds() {
  const ws = new Set();
  for (const m of Object.values(DATA.monsters)) for (const s of m.spawnMaps) if (inFaction(s.world, state.faction) && s.points.length) ws.add(s.world);
  return [...ws].sort((a, b) => (WORLDS[a]?.order ?? 99) - (WORLDS[b]?.order ?? 99));
}

function ensureMap() {
  if (map) return;
  map = L.map("map", { crs: L.CRS.Simple, minZoom: 0, maxZoom: 6, zoomSnap: 0.5, attributionControl: false, preferCanvas: true });
  pointLayer = L.layerGroup().addTo(map);
  hotLayer = L.layerGroup().addTo(map);
}

function setWorld(world, fit = true) {
  ui.world = world;
  const [tx, ty] = WORLDS[world]?.tiles || [8, 8];
  const side = worldSide(world);
  const bounds = L.latLngBounds(toLatLng(0, 0), toLatLng(tx / side, ty / side));
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(`tiles/${world}/{z}/{x}/{y}.webp`, { tileSize: 256, maxNativeZoom: WORLDS[world]?.zoom ?? 4, maxZoom: 6, noWrap: true, bounds }).addTo(map);
  map.setMaxBounds(bounds.pad(0.2));
  if (fit) map.fitBounds(bounds);
}

function renderMap() {
  ensureMap();
  setTimeout(() => map.invalidateSize(), 0);
  const worlds = availableWorlds();
  if (!worlds.includes(ui.world)) ui.world = worlds[0] || null;
  $("#world").innerHTML = worlds.map((w) => `<option value="${w}" ${w === ui.world ? "selected" : ""}>${esc(worldName[w] || w)}</option>`).join("");
  if (!ui.world) return;
  if (!tileLayer || tileLayer._url.indexOf(`/${ui.world}/`) < 0) setWorld(ui.world);
  drawPoints();
}

function drawPoints() {
  pointLayer.clearLayers();
  hotLayer.clearLayers();
  const focus = ui.mapFocus;
  $("#map-filter").innerHTML = focus
    ? `${esc(DATA.monsters[focus].name)} のみ表示 <button type="button" class="linkbtn" id="clear-focus">解除</button>`
    : "";
  const pts = (targetPoints()[ui.world] || []).filter((p) => !focus || p.m.slug === focus);
  if (focus && !pts.length) {
    // 完了済みペットのモンスターでも、絞り込み表示では出す
    const m = DATA.monsters[focus];
    for (const sm of m.spawnMaps) if (sm.world === ui.world) for (const [x, y] of sm.points) pts.push({ x, y, m, pets: m.pets });
  }
  for (const p of pts) {
    const type = p.pets[0].pet.type;
    L.circleMarker(toLatLng(p.x, p.y), { radius: 5, color: "#000", weight: 1, fillColor: TYPE_COLOR[type], fillOpacity: 0.9 })
      .bindPopup(() => monsterPopup(p.m))
      .addTo(pointLayer);
  }
  if ($("#show-hot").checked && !focus) {
    for (const s of computeHotspots(+$("#radius").value).filter((s) => s.world === ui.world)) {
      L.circle(toLatLng(s.x, s.y), { radius: s.r * 256, color: "#d9b45a", weight: 2, fill: true, fillOpacity: 0.06, dashArray: "6 4" })
        .bindPopup(`<strong>${esc(mainZone(s.mons))}</strong><br>ペット${s.pets.size}種 ・ 湧き${s.ns.length}か所<div class="tags">${petTags(s.pets)}</div>`)
        .addTo(hotLayer);
    }
  }
  $("#legend").innerHTML = TYPES.map((t) => `<span><span class="dot bg-${t.id}"></span> ${t.name}</span>`).join("") +
    `<span>点 ${pts.length}</span>`;
}

function monsterPopup(m) {
  const pets = m.pets
    .map((x) => `<div><span class="dot bg-${x.pet.type}"></span> ${esc(x.pet.name)} <span class="muted">${isDone(x.pet) ? "獲得済み" : `あと${remaining(x.pet)}`}</span></div>`)
    .join("");
  const zones = zoneSummary(m).filter((z) => !z.off).map((z) => esc(z.name)).join("、");
  return `<strong><a href="${METABOT}/monsters/${esc(m.slug)}" target="_blank" rel="noopener">${esc(m.name)}</a></strong> Lv.${m.level ?? "?"}
    <div class="muted">${zones}</div>${pets}`;
}

function focusMonster(slug) {
  const m = DATA.monsters[slug];
  const world = m.spawnMaps.find((s) => inFaction(s.world, state.faction) && s.points.length)?.world;
  if (!world) return;
  ui.mapFocus = slug;
  ui.world = world;
  showTab("map");
  setWorld(world, false);
  const pts = m.spawnMaps.filter((s) => s.world === world).flatMap((s) => s.points);
  map.fitBounds(L.latLngBounds(pts.map(([x, y]) => toLatLng(x, y))).pad(0.5), { maxZoom: 4 });
}

function focusSpot(i) {
  const s = ui.lastSpots?.[i];
  if (!s) return;
  ui.mapFocus = null;
  ui.world = s.world;
  showTab("map");
  setWorld(s.world, false);
  const d = s.r * 1.6;
  map.fitBounds(L.latLngBounds(toLatLng(s.x - d, s.y - d), toLatLng(s.x + d, s.y + d)), { maxZoom: 5 });
}

// ---------------------------------------------------------------- データ管理

function exportState() {
  $("#backup").value = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, ...state }))));
  $("#backup").select();
  $("#data-msg").textContent = "表示した文字列をコピーして保管してください。";
}

function importState() {
  try {
    const raw = $("#backup").value.trim();
    const s = JSON.parse(raw.startsWith("{") ? raw : decodeURIComponent(escape(atob(raw))));
    if (!s || typeof s.souls !== "object") throw new Error("bad");
    state = { faction: s.faction === "dark" ? "dark" : "light", souls: s.souls, typeLv: s.typeLv || {} };
    saveState();
    renderHeader();
    $("#data-msg").textContent = "読み込みました。";
  } catch (_) {
    $("#data-msg").textContent = "読み込めませんでした。文字列が正しいか確認してください。";
  }
}

let resetArmed = false;
function resetState() {
  if (!resetArmed) {
    resetArmed = true;
    $("#reset").textContent = "もう一度押すと消去します";
    setTimeout(() => { resetArmed = false; $("#reset").textContent = "記録をすべて消す"; }, 4000);
    return;
  }
  resetArmed = false;
  state = { faction: state.faction, souls: {}, typeLv: {} };
  saveState();
  $("#reset").textContent = "記録をすべて消す";
  renderHeader();
  $("#data-msg").textContent = "記録を消去しました。";
}

// ---------------------------------------------------------------- イベント

function bind() {
  document.querySelector(".faction").addEventListener("click", (e) => {
    const f = e.target.closest("button")?.dataset.faction;
    if (!f || f === state.faction) return;
    state.faction = f;
    ui.mapFocus = null;
    saveState();
    renderAll();
  });
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const t = e.target.closest("button")?.dataset.tab;
    if (t) showTab(t);
  });

  $("#pets").addEventListener("click", (e) => {
    const pip = e.target.closest(".pip");
    if (pip) {
      const n = +pip.dataset.n;
      const cur = state.souls[pip.dataset.pet] || 0;
      state.souls[pip.dataset.pet] = cur === n ? n - 1 : n;
      if (!state.souls[pip.dataset.pet]) delete state.souls[pip.dataset.pet];
      saveState();
      const open = [...document.querySelectorAll("#pets details[open]")].map((d) => d.closest(".pet").querySelector(".pet-name").textContent);
      renderHeader();
      renderPets();
      document.querySelectorAll("#pets .pet").forEach((el) => {
        if (open.includes(el.querySelector(".pet-name").textContent)) el.querySelector("details").open = true;
      });
      return;
    }
    const mb = e.target.closest("[data-map-monster]");
    if (mb) focusMonster(mb.dataset.mapMonster);
  });
  $("#typelv").addEventListener("change", (e) => {
    const t = e.target.dataset.type;
    if (!t) return;
    const v = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 0));
    if (e.target.value === "") delete state.typeLv[t];
    else state.typeLv[t] = v;
    saveState();
    renderTypeLevels();
  });
  $("#type-chips").addEventListener("click", (e) => {
    const t = e.target.closest(".chip")?.dataset.type;
    if (!t) return;
    ui.typeFilter.has(t) ? ui.typeFilter.delete(t) : ui.typeFilter.add(t);
    renderPets();
  });
  $("#q").addEventListener("input", renderPets);
  $("#only-todo").addEventListener("change", renderPets);
  $("#only-faction").addEventListener("change", renderPets);

  $("#radius").addEventListener("input", renderSpots);
  $("#tab-spots").addEventListener("click", (e) => {
    const b = e.target.closest("[data-map-spot]");
    if (b) focusSpot(+b.dataset.mapSpot);
  });

  $("#world").addEventListener("change", (e) => {
    ui.mapFocus = null;
    setWorld(e.target.value);
    drawPoints();
  });
  $("#show-hot").addEventListener("change", drawPoints);
  $("#map-filter").addEventListener("click", (e) => {
    if (e.target.id === "clear-focus") { ui.mapFocus = null; drawPoints(); }
  });

  $("#export").addEventListener("click", exportState);
  $("#import").addEventListener("click", importState);
  $("#reset").addEventListener("click", resetState);
}

// ---------------------------------------------------------------- 起動

fetch("data/pets.json")
  .then((r) => r.json())
  .then((data) => {
    DATA = prepare(data);
    $("#built").textContent = ` データ更新日: ${data.builtAt}`;
    bind();
    renderAll();
  })
  .catch((e) => {
    $("main").innerHTML = `<p class="empty">データを読み込めませんでした（${esc(e.message)}）。</p>`;
  });
