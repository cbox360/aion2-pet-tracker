# AION2 ペット収集トラッカー

AION2 のペット（マウント）の収集済み / 未収集を記録し、まだ集め終わっていないペットの魂を落とすモンスターの湧き位置と、効率のいい狩場を表示する静的サイト。

- 天族 / 魔族を切り替えられる（深淵は両方に表示）
- 記録はブラウザの localStorage にだけ保存（サーバー不要・アカウント不要）。データ管理タブから文字列で書き出し / 読み込みできる

## 構成

```
site/            公開するファイル一式（このフォルダをそのまま静的ホスティングに置く）
  index.html / style.css / app.js
  data/pets.json ペット・モンスター・湧き座標（scripts/build_data.py が生成）
  tiles/         背景地図タイル（scripts/build_tiles.py が生成）
scripts/
  build_data.py  MetaBot.GG のページからデータを作る
  build_tiles.py 背景地図タイルを作る
cache/           取得済み HTML・元画像（公開しない）
```

## データの更新

ゲームのアップデートでペットやモンスターが増えたとき:

```sh
python scripts/build_data.py --refresh   # 全ページを取り直す（1.2 秒間隔、20 分ほど）
python scripts/build_tiles.py world_l_a world_d_a abyss_reshanta_a            # interactive-map の地図から
python scripts/build_tiles.py --metabot world_l_b world_d_b abyss_reshanta_c abyss_reshanta_d  # MetaBot の全体図から
python scripts/build_portraits.py   # ショップ確認タブの照合用ポートレート（site/portraits）
python scripts/build_cubes.py       # ヒドゥンキューブの出現候補地（site/data/cubes.json）
python scripts/fetch_gear_costumes.py  # 装備ごとの外形（公式サイトの API。約5,300件、1時間ほど）
python scripts/build_skins.py       # 外形タブのデータ（site/data/skins.json）
```

新しいワールドに湧き点が出たら `site/app.js` の `WORLDS` / `WORLD_PX` に追加する。

`build_tiles.py` / `build_portraits.py` は Pillow が必要（`pip install pillow`）。

ショップ確認タブは、ショップ画面の枠位置を 2539x1417 の画面を基準に `site/shop.js` の `SHOP_SLOTS` で持っている。ゲーム側でレイアウトが変わったら更新する。

## ローカルで確認

```sh
cd site
python -m http.server 8000
# http://localhost:8000
```

## 公開（GitHub Pages）

公開先: https://cbox360.github.io/aion2-pet-tracker/

GitHub Pages は `gh-pages` ブランチ（`site/` の中身だけを切り出したもの）を配信している。`site/` を更新したら:

```sh
sh scripts/deploy.sh "コミットメッセージ"
```

CSS/JS の読み込みに付けた版番号（`?v=`）を更新してから公開する。GitHub Pages は各ファイルを 10 分キャッシュさせるので、版番号を変えないと更新直後に新旧のファイルが混ざって動かないことがある。

## データの出典とライセンス

- ペット・モンスター・湧き位置: [MetaBot.GG](https://metabot.gg/en/aion-2)（AION 2 グローバル版クライアントのデータ）。利用規約により、元ページへのリンク（nofollow なし）を付けて利用している。
- ヒドゥンキューブの出現候補地: MetaBot.GG の Hidden Cube ページの図（重複のない地点 約1,160。ページの「候補地点 3,722」はキューブごとの延べ数）。ゾーン名は各ゾーンページの同じ位置の点から決める。
- 外形と装備の対応: AION 2 公式サイトのアイテム情報 API（装備の `costumes`）。装備の一覧は台湾版のアイテム辞書から取る（グローバル版には一覧がない）。日本語名と入手場所は MetaBot.GG。MetaBot のデータより新しい装備・外形は日本語名がないので英語名で表示する。
- 地図画像: [aion2-interactive-map](https://github.com/aion2-interactive-map/aion2-interactive-map)（CC BY-NC 4.0）。そのため本サイトは非営利で運営すること。
- AION 2 は NCSOFT の商標。本サイトは非公式。
