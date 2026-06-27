variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "domain_name" {
  type        = string
  description = "ルートドメイン名 (例: bar504.net)"
}

variable "chiikawa_family_id" {
  type        = string
  description = "UserCollection テーブルの共有ファミリーID"
  default     = "shoiwase"
}

variable "chiikawa_test_password" {
  type        = string
  sensitive   = true
  description = "E2Eスモークテスト用 Cognito ユーザーのパスワード (GitHub Secrets: CHIIKAWA_TEST_PASSWORD)"
}
