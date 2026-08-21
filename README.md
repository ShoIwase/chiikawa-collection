# ご当地ちいかわコレクション 🐾

「ご当地ちいかわ ダイカットキーホルダー」の所持状況を家族で管理するコレクションアプリ。
全国のご当地キーホルダーを自動収集し、商品画像から **ちいかわ / ハチワレ / うさぎ** を判定して
キャラクター別に登録。所持チェック・都道府県フィルタ・タグ付けができる。

## 主な機能

- **自動収集**：販売サイトを毎週巡回し、ダイカットキーホルダー商品を自動取り込み
- **画像からキャラ判定**：商品画像を AI（Amazon Bedrock / Claude）で解析し、写っている
  ちいかわ・ハチワレ・うさぎを検出。1商品＝最大3エントリに分割
- **キャラ別のサムネ切り出し**：元画像は3キャラが横並びなので、一覧で判別できるよう
  各キャラの柄と名前ラベルだけを切り出して保存。隣のキャラが端に写り込まないよう、
  切り出し窓はキャラごとの領域内にクランプし、足りない横幅は白パディングで正方形に整える
- **地域の自動判定と集約**：画像内の「○○限定」から地域を抽出。市区町村は親の都道府県へ集約され、
  「千葉県」を選べば市川市の商品も表示される
- **写真スキャンで一括登録**：手持ちのキーホルダーをカメラ撮影 or 保存済み写真から選択すると、
  AI がキャラ・地域・商品を認識して該当アイテムを提示。チェックして所持状態に反映できる
- **所持管理**：家族共有で所持/未所持をチェック（ログイン者によらず共有）。タップは未保存の変更として
  溜まり、**保存ボタンでまとめて確定**（誤タップ防止。保存するまでサーバーに反映されない）
- **フィルタ**：都道府県 → 市区町村 の2段フィルタ、キャラクター絞り込み、フリーワード検索、
  自由タグ、未所持のみ表示
- **確認フロー**：自動取り込みした商品を人が確認（verify）してから一覧に反映
- **集計**：キャラ別・都道府県別の所持率などを `/stats/` 画面で確認

## 技術スタック

| レイヤ | 技術 |
|---|---|
| フロントエンド | Next.js 15 (App Router) / React 19 / Tailwind CSS / TypeScript |
| 認証 | Amazon Cognito（AWS Amplify） |
| API | Java 21 Lambda（SnapStart）+ API Gateway HTTP API（Cognito JWT） |
| スクレイパー | Python 3.12 Lambda + Amazon Bedrock（Claude Haiku）+ BeautifulSoup |
| データ | DynamoDB / S3 / CloudFront |
| IaC | Terraform（基盤）/ AWS SAM（Lambda・API・スケジュール） |
| CI/CD | GitHub Actions |
| テスト | pytest（scraper）/ Playwright（フロント e2e）/ JUnit（API） |

## アーキテクチャ

```
                 ┌──────────────┐
  毎週月 9:00 JST→ │  Scraper     │ 販売サイト巡回 → 画像DL → Bedrockで
  (EventBridge)  │  (Python)    │ キャラ/地域判定 → S3保存 → DynamoDB登録
                 └──────┬───────┘
                        ▼
   ┌──────────┐   ┌──────────────┐   ┌──────────────┐
   │ Next.js  │──▶│ API Gateway   │──▶│  API (Java)   │
   │ (Amplify)│   │ + Cognito JWT │   │  /items 等    │
   └────┬─────┘   └──────────────┘   └──────┬───────┘
        │                                    ▼
        │  画像                       ┌──────────────┐
        └───────────── CloudFront ◀── │ DynamoDB / S3 │
                                      └──────────────┘
```

## ディレクトリ構成

```
chiikawa-collection/
├── frontend/          # Next.js アプリ（コレクション画面・フィルタ・確認画面）
│   ├── src/app/         # ページ（collection / verify / login）
│   ├── src/components/  # FilterBar, ItemCard, TagEditor, VerifyModal ...
│   ├── src/lib/         # types, api, auth
│   └── tests/           # Playwright e2e
├── lambda/
│   ├── api/             # Java 21 Lambda（GET /items, status, verify, tags）
│   ├── scraper/         # Python スクレイパー（handler.py, scraper.py, area_mapping.py）
│   └── scanner/         # Python 写真スキャン Lambda（POST /scan, handler.py, matcher.py）
├── terraform/         # DynamoDB / S3 / CloudFront / Cognito
├── scripts/           # 運用スクリプト（recrop_images.py: 既存画像の切り出し直し）
├── template.yaml      # SAM（Lambda・API Gateway・スケジュール）
├── .github/workflows/ # deploy-sam / deploy-frontend / deploy-infra / run-scraper
└── CLAUDE.md          # 運用ドキュメント（AWS権限・Bedrock・洗い替え手順など）
```

## データモデル（DynamoDB）

**ChiikawaMaster**（商品マスタ） — PK=`Category`("KeyChain"), SK=`ItemName`
| 属性 | 例 |
|---|---|
| `ItemName` | `うさぎ　静岡 みかん　ダイカットキーホルダー`（キャラ先頭・地域・末尾に品目） |
| `Motif` | キャラ（ちいかわ / ハチワレ / うさぎ） |
| `AreaType` / `AreaName` | `都道府県`/`静岡`、`市区町村`/`市川市`、`その他`/`香港` |
| `Prefecture` | 所属都道府県の正式名（`静岡県`／市区町村は親県に集約） |
| `Tags` | 自動付与（キャラ・地名）＋手動編集 |
| `ImageUrl` / `SourceImageId` | CloudFront 画像パス / 元画像ID（増分取り込み用） |

**UserCollection**（所持状況） — PK=`FamilyID`, SK=`ItemName`, `Status`(所持)
※ FamilyID は固定（家族で1つのコレクションを共有）

## ローカル開発

```bash
# フロントエンド
cd frontend
npm install
npm run dev            # http://localhost:3000
npx playwright test    # e2e テスト

# スクレイパー（Python）
cd lambda/scraper
python3 -m pytest tests/ -q

# 写真スキャン（Python）
cd lambda/scanner
python3 -m pytest tests/ -q

# API（Java）
cd lambda/api
mvn test
```

## デプロイ

`main` への push で GitHub Actions が自動デプロイする。

| 変更パス | ワークフロー |
|---|---|
| `lambda/**`, `template.yaml` | `deploy-sam.yml`（テスト → SAM deploy） |
| `frontend/**` | `deploy-frontend.yml` |
| `terraform/**` | `deploy-infra.yml` |

スクレイパーの手動実行は GitHub Actions の **Run Scraper (Manual)** から、または
AWS CLI で `chiikawa-scraper` Lambda を invoke する（詳細は [CLAUDE.md](./CLAUDE.md)）。

画像の切り出しルールを変えたときは、S3 の既存画像も貼り替える必要がある
（スクレイパーは `SourceImageId` で商品ごとスキップするため再取得されない）。

```bash
python3 scripts/recrop_images.py           # dry-run（対象を出すだけ）
python3 scripts/recrop_images.py --apply   # 上書き ＋ CloudFront 無効化
```

## 運用

AWS の権限操作・Bedrock の設定・データ洗い替え手順などの運用ノウハウは
[CLAUDE.md](./CLAUDE.md) に集約している。
