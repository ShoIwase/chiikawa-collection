terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "bar504-terraform-state"
    key            = "chiikawa/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "bar504-terraform-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project   = "chiikawa-collection"
      ManagedBy = "terraform"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = {
      Project   = "chiikawa-collection"
      ManagedBy = "terraform"
    }
  }
}
