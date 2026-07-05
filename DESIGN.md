# ご当地ちいかわコレクション アプリ 設計書

## 1. 概要

家族間でちいかわダイカットキーホルダーのコレクション状況を共有・管理するプライベート Web アプリ。

- **フロントエンド**: Next.js 15 (静的サイト) → S3 + CloudFront で配信
- **バックエンド API**: Java 21 Lambda + API Gateway (SnapStart で高速化)
- **スクレイパー**: Python Lambda が毎日公式サイトを巡回し、新商品を自動登録
- **データ**: DynamoDB 2テーブル (マスター / 所持状況)
- **認証**: 既存 Cognito ユーザープール (TaskManager-prod) を再利用

---

## 2. リポジトリ構成

| リポジトリ | 役割 | 管理対象 |
|---|---|---|
| `Bar504/bar504-infra` | **組織共有インフラ** | Route53、ACM証明書、Cognito ユーザープール |
| `ShoIwase/chiikawa-collection` | **このアプリ全体** | アプリコード + インフラ定義 |

`chiikawa-collection` の中身：

```
chiikawa-collection/
├── template.yaml          ← SAM: Lambda / API GW / EventBridge
├── samconfig.toml         ← SAM デプロイ設定
├── terraform/             ← Terraform: S3 / CloudFront / DynamoDB / Cognito
├── lambda/
│   ├── api/               ← Java 21 (API Lambda)
│   └── scraper/           ← Python 3.12 (スクレイパー Lambda)
├── frontend/              ← Next.js 15
└── .github/workflows/
    ├── deploy-infra.yml   ← terraform apply
    ├── deploy-sam.yml     ← sam deploy
    └── deploy-frontend.yml← S3 sync + CloudFront キャッシュ削除
```

---

## 3. AWS リソース一覧と管理先

### Terraform が管理するリソース (`terraform/`)

| リソース | 説明 |
|---|---|
| S3 `chiikawa-static-{account}` | Next.js ビルド成果物の置き場 |
| S3 `chiikawa-images-{account}` | スクレイパーが保存する商品画像 |
| CloudFront Distribution | `chiikawa.bar504.net` でサイトを配信。OAC で S3 を保護 |
| Route53 Aレコード | `chiikawa.bar504.net` → CloudFront |
| DynamoDB `ChiikawaMaster` | 商品マスターデータ |
| DynamoDB `UserCollection` | 家族の所持状況 |
| Cognito App Client `ChiikawaClient` | このアプリ専用のログイン設定 |
| SSM `/chiikawa/*` | CI/CD が参照する設定値置き場 |

### SAM (CloudFormation) が管理するリソース (`template.yaml`)

| リソース | 説明 |
|---|---|
| Lambda `chiikawa-api` | Java 21 / SnapStart / alias `live` |
| Lambda `chiikawa-scraper` | Python 3.12 / 毎日 9:00 JST 起動 |
| API Gateway HTTP API | Cognito JWT 認証付き REST エンドポイント |
| EventBridge ScheduleV2 | スクレイパーの定期実行トリガー |
| IAM ロール (自動生成) | Lambda 実行権限 |

### bar504-infra が管理するリソース (変更なし・参照のみ)

| リソース | 説明 |
|---|---|
| Route53 Hosted Zone | `bar504.net` ドメイン |
| ACM 証明書 (us-east-1) | `*.bar504.net` ワイルドカード証明書 |
| Cognito ユーザープール | `TaskManager-prod` (ap-northeast-1_xP4qySxtH) |

---

## 4. システム構成図

```
[ブラウザ]
    │ https://chiikawa.bar504.net
    ▼
[CloudFront] ──── /images/* ────▶ [S3: chiikawa-images]
    │                               (スクレイプ画像)
    │ /*
    ▼
[S3: chiikawa-static]
(Next.js 静的ファイル)

[ブラウザ → API呼び出し]
    │ Authorization: Bearer <Cognito JWT>
    ▼
[API Gateway HTTP API]
    │ JWT検証 (Cognito)
    ▼
[Lambda: chiikawa-api (Java 21 / SnapStart)]
alias "live" ← バージョン管理で SnapStart が有効になる
    │
    ├── GET  /items          → DynamoDB Query (Master + Collection 結合)
    ├── GET  /items/pending  → DynamoDB Query (未確認アイテム)
    ├── PUT  /items/{name}/status → DynamoDB Update (所持フラグ)
    └── PUT  /items/{name}/verify → DynamoDB Update (エリア確定)

[EventBridge: cron(0 0 * * ? *)] → 毎日 9:00 JST
    ▼
[Lambda: chiikawa-scraper (Python 3.12)]
    │
    ├── jp-api.com をスクレイプ
    ├── 画像を S3 に保存
    └── DynamoDB ChiikawaMaster に IsVerified=false で登録
```

---

## 5. データベース設計

### ChiikawaMaster テーブル

| 属性 | 型 | 説明 |
|---|---|---|
| `Category` (PK) | String | 固定値 `"KeyChain"` |
| `ItemName` (SK) | String | 例: `"小樽運河 ダイカットキーホルダー"` |
| `Motif` | String | モチーフ (ちいかわ / ハチワレ / うさぎ など) |
| `AreaType` | String | `都道府県` / `市町村` / `温泉地` / `海外` |
| `AreaName` | String | 例: `"北海道"` / `"箱根"` / `"香港"` |
| `ImageUrl` | String | `/images/xxx.jpg` (CloudFront 経由) |
| `IsVerified` | Boolean | `false`=スクレイパー仮登録 / `true`=ユーザー確認済み |
| `CreatedAt` | String | ISO 8601 |

### UserCollection テーブル

| 属性 | 型 | 説明 |
|---|---|---|
| `FamilyID` (PK) | String | 家族共有ID (固定値: `"shoiwase"`) |
| `ItemName` (SK) | String | ChiikawaMaster の SK と一致 |
| `Status` | Boolean | `true`=所持 / `false`=未所持 |
| `UpdatedAt` | String | ISO 8601 |

---

## 6. 認証フロー

```
1. ブラウザでパスワードログイン
   └─▶ Amplify.signIn() → Cognito SRP認証

2. Cognito が JWT (IDトークン) を発行

3. API 呼び出し時に Authorization ヘッダーに付与
   Authorization: Bearer <IDトークン>

4. API Gateway が Cognito に対してトークン検証

5. 検証OK → Lambda 呼び出し
```

Cognito Hosted UI (OAuth リダイレクト) は使用しない。
フロントエンドから直接 SRP 認証 (ユーザー名・パスワード入力)。

---

## 7. 画面構成

| 画面 | URL | 説明 |
|---|---|---|
| ログイン | `/login/` | ユーザー名・パスワード入力 |
| コレクション一覧 | `/collection/` | メイン画面。アイテムをタップして所持切替 |
| 未確認レビュー | `/verify/` | スクレイパーが追加した新着の確認・修正 |

### コレクション一覧の機能
- **アラート**: 未確認アイテムが N 件ある場合に通知バナーを表示
- **フィルター**: AreaType (都道府県・市町村・温泉地・海外) で絞り込み → AreaName で絞り込み
- **検索**: アイテム名・モチーフのテキスト検索
- **切替**: タップで「未所持(グレー)」⇔「所持(カラー)」切替 (楽観的更新)

---

## 8. CI/CD パイプライン

GitHub Actions の Secrets は 2 つのみ。

| Secret | 値 |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<AWS_ACCOUNT_ID>:role/bar504-github-actions` |
| `DOMAIN_NAME` | `bar504.net` |

その他の設定値は Terraform が SSM に書き込み、各ワークフローが読み取る。

```
コード変更 → git push → GitHub Actions

terraform/ 変更時
  deploy-infra.yml
    └─▶ terraform apply
          └─▶ DynamoDB / S3 / CloudFront / Cognito / SSM

lambda/ または template.yaml 変更時
  deploy-sam.yml
    ├─▶ sam build  (Maven でビルド / pip install)
    └─▶ sam deploy (CloudFormation スタック更新)
          └─▶ Lambda / API GW / EventBridge 更新
                └─▶ SSM /chiikawa/api-url を上書き

frontend/ 変更時
  deploy-frontend.yml
    ├─▶ SSM から api-url などを取得
    ├─▶ npm run build (環境変数を注入して静的ファイル生成)
    ├─▶ S3 sync
    └─▶ CloudFront キャッシュ削除
```

### デプロイ初回の順序

初回のみ以下の順序で手動実行が必要：

```
1. terraform apply  (DynamoDB, S3, CloudFront, Cognito, SSM の作成)
2. sam deploy       (Lambda, API GW の作成・SSM への api-url 書き込み)
3. フロントエンドデプロイ (SSM から api-url を読んでビルド)
```

2回目以降はそれぞれ独立して自動デプロイ。

---

## 9. スクレイパーのエリア予測ロジック

商品名 (`ItemName`) からエリア種別とエリア名を自動判定する。

| 優先順位 | 判定方法 | 例 |
|---|---|---|
| 1 | 都道府県名が含まれる | `"北海道 ダイカットキーホルダー"` → `都道府県 / 北海道` |
| 2 | 温泉地名が含まれる | `"箱根 ダイカットキーホルダー"` → `温泉地 / 箱根` |
| 3 | 海外地名が含まれる | `"香港 ダイカットキーホルダー"` → `海外 / 香港` |
| 4 | フォールバック | 最初のトークンから地名を推測 → `市町村 / xxx` |

自動登録時は必ず `IsVerified = false`。ユーザーが `/verify/` 画面で確認・修正して確定する。

---

## 10. SnapStart の仕組み

通常の Java Lambda はコールドスタート時に JVM 起動 + クラスロードで数秒かかる。

```
通常の Java Lambda:
  コールドスタート → JVM 起動 → クラスロード → 初期化 → リクエスト処理
                    ←────── 数秒 ──────────────▶

SnapStart 有効時:
  sam deploy → JVM 起動 → 初期化 → スナップショット作成
  コールドスタート → スナップショット復元 → リクエスト処理
                    ←── 数十ms ─▶
```

`ApiHandler.java` で DynamoDB クライアントを static フィールドに初期化しているため、
スナップショットに接続済みのクライアントが含まれ、復元後すぐにリクエストを処理できる。
