"use strict";
// ショップ確認: ゲーム画面を撮影し、ショップに並んだペットをアイコン照合で判別して「買うべきか」を出す。
// 画像はブラウザ内だけで処理し、どこにも送らない。app.js のあとに読み込む。

// ---------------------------------------------------------------- 分類

const SHOP_CLASS = {
  none: { order: 1, label: "① フィールドで出ない", buy: true },
  boss: { order: 2, label: "② フィールドボス", buy: true },
  rift: { order: 3, label: "③ 亀裂限定", buy: true },
  hunt: { order: 8, label: "狩りで取れる", buy: false },
  done: { order: 9, label: "収集済み", buy: false },
};

const isFieldBoss = (m) => m.rank === "ヒーロー";

// モンスターが湧くワールド（湧き図とゾーン表）。未開放の可能性がある地図は設定に従う
function monsterWorlds(m) {
  const ws = new Set(m.spawnMaps.map((s) => s.world));
  for (const z of m.zones) if (z.world) ws.add(z.world);
  return [...ws].filter((w) => !(WORLDS[w]?.unreleased && !state.includeUnreleased));
}

// 一番楽な入手方法で分類する: 自陣営の通常モンスター > 亀裂の通常モンスター > フィールドボス > なし
function shopClass(p) {
  if (isDone(p)) return { key: "done" };
  let own = false, rift = false, boss = null;
  for (const d of p.drops) {
    const m = DATA.monsters[d.monster];
    for (const w of monsterWorlds(m)) {
      const mine = inFaction(w, state.faction), riftSide = isRiftWorld(w);
      if (!mine && !riftSide) continue;
      if (isFieldBoss(m)) boss ||= { m, rift: !mine };
      else if (mine) own = true;
      else rift = true;
    }
  }
  if (own) return { key: "hunt" };
  if (rift) return { key: "rift" };
  if (boss) return { key: "boss", boss };
  return { key: "none" };
}

// ---------------------------------------------------------------- 画像照合

// 基準にしたショップ画面（2539x1417）での各枠のアイコン中心と一辺。UI は高さに合わせて伸縮し、左右中央寄せとみなす
const SHOP_REF = { w: 2539, h: 1417 };
const SHOP_SLOTS = [
  [457, 505, 149], [781, 574, 149], [1108, 603, 143], [1435, 600, 149], [1758, 578, 146],
  [2088, 498, 149], [517, 911, 152], [844, 971, 146], [1698, 968, 146], [2025, 911, 149],
];
const FEAT = 20;          // 照合する縮小画像の一辺
const MIN_SCORE = 0.55;   // これ未満は「要確認」
const MIN_GUESS = 0.40;   // これ未満は判別できずとする
const SOLDOUT_ROWS = [0.5, 0.78]; // 「品切れ」の帯がかかる高さ（アイコンの縦位置の割合）
const PORTRAIT_BG = "rgb(20,18,22)";

// 商品名の先頭「ペット：」の見本（枠の一辺を 100px にそろえたときの 58x11 の濃淡）。
// 「特殊」タブにはペット以外（神石・外形など）も並ぶので、これが見つからない枠は除く
const PET_TITLE = { w: 58, h: 11, data: [3,3,3,5,0,0,0,5,2,20,145,187,115,8,3,4,3,3,3,3,3,5,5,3,3,3,3,3,3,3,3,3,6,0,52,206,165,20,0,4,3,3,3,4,3,3,3,3,3,3,2,7,86,84,6,2,3,3,3,3,4,0,25,92,41,0,1,112,136,29,170,62,0,6,4,4,5,4,2,0,0,3,3,3,4,5,3,3,4,3,6,0,45,201,161,16,2,5,4,3,3,3,3,3,3,3,3,6,0,76,207,207,74,0,5,3,3,5,0,29,169,210,190,73,0,108,146,51,174,59,0,6,3,0,0,1,6,45,39,1,4,4,0,0,3,4,4,3,6,0,45,201,159,5,0,3,6,5,3,4,4,4,4,4,3,6,1,55,190,189,52,1,5,4,6,1,17,156,208,179,199,197,69,7,127,169,95,5,4,3,3,38,86,7,42,201,143,1,1,38,152,96,4,3,4,4,6,0,47,196,184,96,31,6,0,0,6,4,4,4,4,4,4,4,4,0,34,34,0,4,4,4,3,4,134,214,157,30,99,207,193,66,0,2,0,3,5,4,5,149,220,59,11,170,197,45,0,78,214,155,3,4,4,4,6,0,48,192,198,210,198,146,91,30,0,2,4,4,4,4,4,4,4,5,0,0,5,4,4,5,0,113,208,186,39,0,1,114,209,192,65,0,7,4,4,7,0,79,209,143,0,109,216,85,0,127,217,78,0,6,4,4,6,0,47,197,177,140,181,215,214,181,131,25,0,5,4,4,4,4,4,4,8,8,4,4,4,6,127,199,201,80,0,7,3,5,131,210,188,53,0,7,4,4,2,15,182,186,19,27,63,11,29,186,187,31,0,6,4,4,6,0,46,201,159,6,28,86,152,212,181,22,1,6,4,4,4,4,4,5,0,0,5,4,4,7,127,213,127,0,6,4,6,2,13,150,208,182,43,0,5,4,3,3,50,30,7,1,0,0,121,216,113,1,6,4,4,4,6,0,46,201,161,17,0,0,8,68,75,0,5,4,4,4,4,4,5,0,34,34,0,5,5,8,5,103,26,1,5,4,4,6,0,28,173,207,174,39,2,5,4,4,0,0,5,3,0,89,207,175,20,2,6,5,4,5,7,0,46,201,160,15,3,9,3,0,0,5,4,5,5,4,4,6,1,53,189,188,50,1,7,9,3,0,3,5,4,4,4,4,6,0,50,186,212,138,3,4,5,4,7,5,0,15,111,203,192,58,0,5,4,4,4,4,7,0,46,202,161,15,2,6,6,7,7,4,4,4,5,5,5,8,0,78,209,208,75,0,9,9,6,6,6,5,5,5,5,5,5,7,0,85,180,40,1,6,5,5,4,9,75,161,206,188,66,0,6,4,5,5,5,5,8,0,53,207,165,21,1,6,5,5,5,5,5,5,5,5,5,5,3,9,89,87,8,4,9,10] };
const PET_TITLE_MIN = 0.55; // ペット 0.77〜0.99、ペット以外 0.24〜0.34（2026-10 の画面で確認）

let shopRefs = null;      // [{ pet, f: Float32Array }]
const shop = { stream: null, video: null, canvas: null, results: [] };

// 縮小画像の RGB 値（FEAT×FEAT×3）を、平均を引いて長さ 1 にした特徴量にする。
// masked のときは「品切れ」の帯の行を除いて計算する（品切れ表示の枠でも照合できるように）
function normalizeFeat(raw, masked) {
  const f = Float32Array.from(raw);
  const skip = (j) => masked && j >= Math.floor(FEAT * SOLDOUT_ROWS[0]) && j < Math.floor(FEAT * SOLDOUT_ROWS[1]);
  const mean = [0, 0, 0];
  let count = 0;
  for (let j = 0; j < FEAT; j++) {
    if (skip(j)) continue;
    for (let i = 0; i < FEAT; i++) for (let c = 0; c < 3; c++) mean[c] += f[(j * FEAT + i) * 3 + c];
    count += FEAT;
  }
  for (let c = 0; c < 3; c++) mean[c] /= count;
  let norm = 0;
  for (let j = 0; j < FEAT; j++)
    for (let i = 0; i < FEAT; i++)
      for (let c = 0; c < 3; c++) {
        const k = (j * FEAT + i) * 3 + c;
        f[k] = skip(j) ? 0 : f[k] - mean[c];
        norm += f[k] * f[k];
      }
  norm = Math.sqrt(norm) || 1;
  for (let k = 0; k < f.length; k++) f[k] /= norm;
  return f;
}

function featureOf(src, sx, sy, sw, sh) {
  const c64 = featureOf.c64 ||= Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
  const cf = featureOf.cf ||= Object.assign(document.createElement("canvas"), { width: FEAT, height: FEAT });
  const x64 = c64.getContext("2d", { willReadFrequently: true });
  x64.imageSmoothingQuality = "high";
  x64.fillStyle = PORTRAIT_BG;
  x64.fillRect(0, 0, 64, 64);
  x64.drawImage(src, sx, sy, sw, sh, 0, 0, 64, 64);
  const xf = cf.getContext("2d", { willReadFrequently: true });
  xf.imageSmoothingQuality = "high";
  xf.drawImage(c64, 0, 0, FEAT, FEAT);
  const px = xf.getImageData(0, 0, FEAT, FEAT).data;
  const raw = new Float32Array(FEAT * FEAT * 3);
  for (let i = 0; i < FEAT * FEAT; i++) for (let c = 0; c < 3; c++) raw[i * 3 + c] = px[i * 4 + c];
  return raw;
}

async function loadShopRefs() {
  if (shopRefs) return shopRefs;
  const load = (p) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ p, img });
    img.onerror = () => resolve(null);
    img.src = `portraits/${p.slug}.webp`;
  });
  const imgs = (await Promise.all(DATA.pets.map(load))).filter(Boolean);
  shopRefs = [];
  for (const { p, img } of imgs) {
    // ショップの枠はポートレートの中央寄りを写すので、余白を変えて 3 通り用意する
    for (const m of [0, 0.08, 0.16]) {
      const s = img.width * m;
      const raw = featureOf(img, s, s, img.width - 2 * s, img.height - 2 * s);
      shopRefs.push({ pet: p, f: normalizeFeat(raw, false), fm: normalizeFeat(raw, true) });
    }
  }
  return shopRefs;
}

// 撮影画像を一度だけ縮小し（枠の一辺がおよそ 64px）、RGB の累積和を作る。切り出しごとの縮小はこれから計算する
function prepareWork(canvas) {
  const k = canvas.height / SHOP_REF.h;
  const scale = Math.min(1, 64 / (148 * k));
  const w = Math.max(1, Math.round(canvas.width * scale)), h = Math.max(1, Math.round(canvas.height * scale));
  const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
  const x = c.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingQuality = "high";
  x.drawImage(canvas, 0, 0, w, h);
  const px = x.getImageData(0, 0, w, h).data;
  const W = w + 1;
  const sat = [0, 1, 2].map(() => new Float64Array(W * (h + 1)));
  for (let yy = 1; yy <= h; yy++)
    for (let xx = 1; xx <= w; xx++) {
      const i = ((yy - 1) * w + (xx - 1)) * 4;
      for (let ch = 0; ch < 3; ch++)
        sat[ch][yy * W + xx] = px[i + ch] + sat[ch][(yy - 1) * W + xx] + sat[ch][yy * W + xx - 1] - sat[ch][(yy - 1) * W + xx - 1];
    }
  shop.work = { scale, w, h, W, sat };
}

// 縮小画像上の正方形を FEAT×FEAT の平均色にする（画面外は背景色で埋める）
function featureFromWork(cx, cy, size) {
  const { scale, w, h, W, sat } = shop.work;
  const x0 = (cx - size / 2) * scale, y0 = (cy - size / 2) * scale, cell = (size * scale) / FEAT;
  const f = new Float32Array(FEAT * FEAT * 3), bg = [20, 18, 22];
  for (let j = 0; j < FEAT; j++)
    for (let i = 0; i < FEAT; i++) {
      let ax = Math.floor(x0 + i * cell), bx = Math.max(ax + 1, Math.floor(x0 + (i + 1) * cell));
      let ay = Math.floor(y0 + j * cell), by = Math.max(ay + 1, Math.floor(y0 + (j + 1) * cell));
      const inside = ax >= 0 && ay >= 0 && bx <= w && by <= h;
      const area = (bx - ax) * (by - ay);
      for (let ch = 0; ch < 3; ch++) {
        const v = inside
          ? (sat[ch][by * W + bx] - sat[ch][ay * W + bx] - sat[ch][by * W + ax] + sat[ch][ay * W + ax]) / area
          : bg[ch];
        f[(j * FEAT + i) * 3 + ch] = v;
      }
    }
  return f;
}

function rankCrop(x, y, size, withMask) {
  const raw = featureFromWork(x, y, size);
  const q = normalizeFeat(raw, false), qm = withMask ? normalizeFeat(raw, true) : null;
  const best = new Map();
  for (const r of shopRefs) {
    let s = 0, sm = 0;
    const f = r.f, fm = r.fm;
    if (withMask) {
      for (let i = 0; i < f.length; i++) { s += f[i] * q[i]; sm += fm[i] * qm[i]; }
      s = Math.max(s, sm);
    } else {
      for (let i = 0; i < f.length; i++) s += f[i] * q[i];
    }
    if (!(best.get(r.pet) >= s)) best.set(r.pet, s);
  }
  return [...best.entries()].map(([pet, score]) => ({ pet, score })).sort((a, b) => b.score - a.score);
}

// 予想位置のまわりを粗く、次に細かく探して一番よく一致する位置で判別する
// 一致度が低いときだけ、「品切れ」の帯を除いた照合でも探し直す（常に使うと位置ずれ先で別のペットに偶然一致しやすい）
const RETRY_MASKED_BELOW = 0.6;

function recognizeAt(cx, cy, size) {
  const search = (withMask) => {
    let best = null;
    const tryAt = (x, y, s) => {
      const r = rankCrop(x, y, s, withMask);
      if (!best || r[0].score > best.ranked[0].score) best = { x, y, size: s, ranked: r };
    };
    for (const ds of [0.9, 1, 1.1])
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++) tryAt(cx + i * 0.1 * size, cy + j * 0.1 * size, size * ds);
    const b = { ...best };
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) if (i || j) tryAt(b.x + i * 0.04 * b.size, b.y + j * 0.04 * b.size, b.size);
    return best;
  };
  const plain = search(false);
  if (plain.ranked[0].score >= RETRY_MASKED_BELOW) return plain;
  const masked = search(true);
  return masked.ranked[0].score > plain.ranked[0].score ? masked : plain;
}

// 枠の上の商品名欄で「ペット：」を探し、一番よく一致したときの正規化相互相関を返す
function petTitleScore(cx, cy, size) {
  const k = 100 / size;
  const sx = cx - 0.95 * size, sy = cy - 0.95 * size, sw = 1.25 * size, sh = 0.45 * size;
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const c = (petTitleScore.c ||= document.createElement("canvas"));
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingQuality = "high";
  x.fillStyle = "#000";
  x.fillRect(0, 0, w, h);
  x.drawImage(shop.canvas, sx, sy, sw, sh, 0, 0, w, h);
  const px = x.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const T = (petTitleScore.T ||= (() => {
    const d = PET_TITLE.data, n = d.length;
    const m = d.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / n) || 1;
    return Float32Array.from(d, (v) => (v - m) / sd);
  })());
  const tw = PET_TITLE.w, th = PET_TITLE.h, n = tw * th;
  let best = -1;
  for (let yy = 0; yy + th <= h; yy++)
    for (let xx = 0; xx + tw <= w; xx++) {
      let sum = 0, sum2 = 0, dot = 0;
      for (let j = 0; j < th; j++)
        for (let i = 0; i < tw; i++) {
          const v = g[(yy + j) * w + xx + i];
          sum += v;
          sum2 += v * v;
          dot += v * T[j * tw + i];
        }
      const sd = Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2));
      if (sd < 1) continue;
      const score = dot / n / sd; // T は平均 0 なので、窓の平均を引く必要はない
      if (score > best) best = score;
    }
  return best;
}

async function recognizeShop() {
  const canvas = shop.canvas;
  if (!canvas) return;
  setShopStatus("判別しています…");
  await loadShopRefs();
  prepareWork(canvas);
  const k = canvas.height / SHOP_REF.h;
  const ox = (canvas.width - SHOP_REF.w * k) / 2;
  shop.results = [];
  for (const [x, y, s] of SHOP_SLOTS) {
    await new Promise((r) => setTimeout(r)); // 画面を固めない
    const cx = ox + x * k, cy = y * k, size = s * k;
    const title = petTitleScore(cx, cy, size);
    shop.results.push(title < PET_TITLE_MIN
      ? { x: cx, y: cy, size, ranked: [], notPet: true, title }
      : { ...recognizeAt(cx, cy, size), title });
  }
  renderShopResults();
}

async function addShopSlot(x, y) {
  await loadShopRefs();
  const k = shop.canvas.height / SHOP_REF.h;
  const size = 148 * k;
  shop.results.push({ ...recognizeAt(x, y, size), manual: true });
  renderShopResults();
}

// ---------------------------------------------------------------- 撮影

async function startShare() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    setShopStatus("このブラウザは画面の撮影に対応していません。PC の Chrome / Edge で開くか、画像ファイルを読み込んでください。");
    return;
  }
  setShopStatus("共有する画面を選んでください…");
  try {
    try {
      shop.stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: 5 }, audio: false });
    } catch (e) {
      // 解像度の指定を受け付けないブラウザ向けに、指定なしでもう一度
      if (e.name !== "TypeError" && e.name !== "OverconstrainedError") throw e;
      shop.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    }
    shop.video = Object.assign(document.createElement("video"), { muted: true, playsInline: true });
    shop.video.srcObject = shop.stream;
    await shop.video.play();
  } catch (e) {
    stopShare();
    setShopStatus(
      e.name === "NotAllowedError"
        ? "画面の共有が許可されませんでした。選択をキャンセルした場合はもう一度押してください。アプリ内のブラウザやプレビュー画面では使えないことがあるので、そのときは Chrome / Edge で直接開いてください。"
        : `画面の共有を開始できませんでした（${e.name}: ${e.message}）。`
    );
    return;
  }
  shop.stream.getVideoTracks()[0].addEventListener("ended", stopShare);
  updateShareButtons();
  setShopStatus("共有中です。ショップを開いた状態で「撮影して判定」を押してください。");
  await new Promise((r) => setTimeout(r, 400));
  await captureFrame();
}

function stopShare() {
  shop.stream?.getTracks().forEach((t) => t.stop());
  shop.stream = null;
  shop.video = null;
  updateShareButtons();
}

async function captureFrame() {
  const v = shop.video;
  if (!v || !v.videoWidth) return;
  useShopImage(v, v.videoWidth, v.videoHeight);
  await recognizeShop();
}

function useShopImage(src, w, h) {
  const c = (shop.canvas ||= document.createElement("canvas"));
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(src, 0, 0, w, h);
}

function loadShopFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const img = new Image();
  img.onload = async () => {
    useShopImage(img, img.naturalWidth, img.naturalHeight);
    URL.revokeObjectURL(img.src);
    await recognizeShop();
  };
  img.src = URL.createObjectURL(file);
}

// ---------------------------------------------------------------- 表示

function setShopStatus(t) {
  $("#shop-status").textContent = t;
}

function updateShareButtons() {
  const on = !!shop.stream;
  $("#shop-share").hidden = on;
  $("#shop-capture").hidden = !on;
  $("#shop-stop").hidden = !on;
}

const CLASS_COLOR = { none: "#ff6b6b", boss: "#ffb84d", rift: "#ffffff", hunt: "#7d8796", done: "#4fbf7f", unknown: "#7d8796", notpet: "#4a4f5a" };

function resultInfo(r) {
  if (r.notPet) return { pet: null, cls: { key: "notpet" } };
  const top = r.ranked[0];
  if (r.chosen) return { pet: r.chosen, cls: shopClass(r.chosen) };
  if (top.score < MIN_GUESS) return { pet: null, cls: { key: "unknown" } };
  return { pet: top.pet, cls: shopClass(top.pet), low: top.score < MIN_SCORE };
}

function drawShopPreview() {
  const src = shop.canvas;
  const view = $("#shop-preview");
  if (!src) { view.hidden = true; return; }
  view.hidden = false;
  const scale = Math.min(1, 1280 / src.width);
  view.width = Math.round(src.width * scale);
  view.height = Math.round(src.height * scale);
  const ctx = view.getContext("2d");
  ctx.drawImage(src, 0, 0, view.width, view.height);
  shop.results.forEach((r, i) => {
    const { cls } = resultInfo(r);
    const s = r.size * scale, x = r.x * scale - s / 2, y = r.y * scale - s / 2;
    ctx.lineWidth = SHOP_CLASS[cls.key]?.buy ? 4 : 2;
    ctx.strokeStyle = CLASS_COLOR[cls.key];
    ctx.setLineDash(cls.key === "notpet" ? [6, 4] : []);
    ctx.strokeRect(x, y, s, s);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(0,0,0,.7)";
    ctx.fillRect(x, y, 22, 20);
    ctx.fillStyle = CLASS_COLOR[cls.key];
    ctx.font = "bold 14px system-ui";
    ctx.fillText(String(i + 1), x + 5, y + 15);
  });
  view.dataset.scale = scale;
}

function cropThumb(r) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  c.getContext("2d").drawImage(shop.canvas, r.x - r.size / 2, r.y - r.size / 2, r.size, r.size, 0, 0, 64, 64);
  return c.toDataURL("image/jpeg", 0.8);
}

function bossNote(cls) {
  if (cls.key !== "boss") return "";
  const m = cls.boss.m;
  return `<div class="muted">${esc(m.name)} Lv.${m.level ?? "?"}${cls.boss.rift ? "（亀裂）" : ""} ・ <button type="button" class="linkbtn" data-goto="${esc(m.slug)}">湧き位置</button></div>`;
}

function renderShopResults() {
  drawShopPreview();
  $("#shop-save").hidden = !shop.canvas;
  const all = shop.results.map((r, i) => ({ r, i, ...resultInfo(r) }));
  const items = all.filter((x) => x.cls.key !== "notpet");
  const skipped = all.length - items.length;
  const buys = items.filter((x) => SHOP_CLASS[x.cls.key]?.buy).sort((a, b) => SHOP_CLASS[a.cls.key].order - SHOP_CLASS[b.cls.key].order);
  setShopStatus(shop.results.length
    ? `${shop.results.length}枠を判別しました。${skipped ? `ペット以外の商品 ${skipped}枠は除外しています（画像では点線の枠）。ペットなのに除外されたときは、画像でそのアイコンをクリックしてください。` : ""}`
    : "");
  $("#shop-summary").innerHTML = !shop.results.length ? "" : buys.length
    ? `<strong>買うべきペット ${buys.length}件</strong>` + buys.map((x) => `<div class="buy-line" style="--c:${CLASS_COLOR[x.cls.key]}">#${x.i + 1} ${esc(x.pet.name)} <span class="cls">${SHOP_CLASS[x.cls.key].label}</span>${x.low ? ' <span class="low">要確認</span>' : ""}</div>`).join("")
    : "<strong>買うべきペットはありません</strong>";
  $("#shop-results").innerHTML = items.map(({ r, i, pet, cls, low }) => {
    const opts = r.ranked.slice(0, 6).map((c) =>
      `<option value="${esc(c.pet.slug)}" ${pet === c.pet ? "selected" : ""}>${esc(c.pet.name)}（${Math.round(c.score * 100)}）</option>`).join("");
    const label = cls.key === "unknown" ? "判別できず" : SHOP_CLASS[cls.key].label;
    return `<li class="shop-item" style="--c:${CLASS_COLOR[cls.key]}">
      <span class="num">${i + 1}</span>
      <img class="crop" src="${cropThumb(r)}" alt="">
      ${pet ? `<img class="ref" src="portraits/${esc(pet.slug)}.webp" alt="">` : '<span class="ref"></span>'}
      <div class="body">
        <div><strong>${pet ? esc(pet.name) : "？"}</strong> <span class="cls">${label}</span>${low ? ' <span class="low" title="一致度が低いので、ショップの表示と見比べてください">要確認</span>' : ""}</div>
        ${pet ? bossNote(cls) : ""}
        <div class="row">
          <select data-shop-pick="${i}" aria-label="候補">${cls.key === "unknown" ? '<option value="">候補を選ぶ</option>' : ""}${opts}</select>
          ${pet ? `<label class="check"><input type="checkbox" data-shop-done="${esc(pet.slug)}" ${isDone(pet) ? "checked" : ""}> 収集済み</label>` : ""}
          ${r.manual ? `<button type="button" class="linkbtn" data-shop-remove="${i}">削除</button>` : ""}
        </div>
      </div>
    </li>`;
  }).join("");
}

function renderShop() {
  updateShareButtons();
  if (shop.canvas) renderShopResults();
}

// ---------------------------------------------------------------- イベント

function bindShop() {
  $("#shop-share").addEventListener("click", startShare);
  $("#shop-capture").addEventListener("click", captureFrame);
  $("#shop-stop").addEventListener("click", stopShare);
  $("#shop-file").addEventListener("change", (e) => loadShopFile(e.target.files[0]));
  $("#shop-save").addEventListener("click", () => {
    shop.canvas?.toBlob((blob) => {
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `aion2-shop-${Date.now()}.png` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  });
  document.addEventListener("paste", (e) => {
    if (ui.tab !== "shop") return;
    const item = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith("image/"));
    if (item) loadShopFile(item.getAsFile());
  });
  $("#shop-preview").addEventListener("click", (e) => {
    const view = e.currentTarget;
    const rect = view.getBoundingClientRect();
    const scale = +view.dataset.scale * (rect.width / view.width);
    addShopSlot((e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
  });
  $("#shop-results").addEventListener("change", (e) => {
    const pick = e.target.dataset.shopPick;
    if (pick != null) {
      shop.results[+pick].chosen = DATA.pets.find((p) => p.slug === e.target.value) || null;
      renderShopResults();
    }
    const done = e.target.dataset.shopDone;
    if (done) {
      if (e.target.checked) state.done[done] = true;
      else delete state.done[done];
      saveState();
      renderHeader();
      renderShopResults();
    }
  });
  $("#tab-shop").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-shop-remove]");
    if (rm) {
      shop.results.splice(+rm.dataset.shopRemove, 1);
      renderShopResults();
    }
    const g = e.target.closest("[data-goto]");
    if (g) focusMonster(g.dataset.goto);
  });
}
