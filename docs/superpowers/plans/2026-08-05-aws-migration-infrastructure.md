# SiteDoc AI — AWS Migration, Part 2: Infrastructure, Pipeline and Cutover

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-08-05-aws-migration-design.md`](../specs/2026-08-05-aws-migration-design.md)

**Predecessor:** [`2026-08-05-aws-migration-app-refactor.md`](2026-08-05-aws-migration-app-refactor.md)
(spec phases 1–4, complete — branch `feat/aws-migration-app-refactor`, PR #1).

**Goal:** Provision the AWS account with Terraform, deploy from GitHub Actions with no
long-lived credentials, verify behavior parity on the real CloudFront URL, and
decommission Render.

**Architecture:** Two Terraform stacks. `infra/bootstrap/` is applied once by hand and
creates only what a pipeline cannot create for itself: the state bucket, the GitHub OIDC
provider, the deploy role, and the ECR repository. `infra/` holds everything else and is
applied by CI behind a manual approval gate. The app code is already written and needs no
changes.

**Tech Stack:** Terraform 1.11 (S3 backend with native lockfile), AWS provider 6.x, GitHub
Actions with OIDC, Docker/ECR, AWS CLI.

**Scope boundary:** this plan covers spec phases 5–7. Nothing in `src/`, `lambda/` or
`scripts/local-server.ts` changes; if a task appears to need an app change, stop and ask —
that means the app refactor missed something.

---

## Who runs what

Tasks are marked with one of two labels, because half of this plan cannot be executed by an
agent in the dev container:

- **[agent]** — writing code and validating it locally (`terraform validate`, `fmt`,
  `actionlint`). No AWS credentials involved.
- **[maintainer]** — anything that touches a real AWS account or the GitHub repository
  settings. Every such task lists the exact commands to run and the exact expected output,
  so it can be pasted and checked. An agent must **stop** at these and hand off.

---

## Global Constraints

Copied verbatim from the spec and project rules. Every task's requirements implicitly
include this section.

- **Region:** `us-east-1`. **Retention:** 30 days for records and screenshots, 14 days for
  logs.
- **No hand-created resources.** If it exists in AWS, it exists in Terraform.
- **No secret ever enters Terraform state.** The two AI keys are declared as placeholder
  SSM parameters with `lifecycle { ignore_changes = [value] }` and set out-of-band with the
  AWS CLI. Terraform state stores every managed attribute in plaintext.
- **No long-lived AWS credentials in GitHub.** The workflow exchanges an OIDC token via
  `sts:AssumeRoleWithWebIdentity`.
- **The OIDC trust policy pins `sub` to the environment form**
  `repo:kyle41io/SiteDoc-AI:environment:production`, not to a branch — that is what makes
  the manual approval gate load-bearing.
- **`AWS_REGION` is never set as a user environment variable** on a Lambda; it is reserved
  and injected by the runtime.
- **Chromium stays the Playwright `v1.60.0-jammy` build** — audit scores are
  browser-dependent.
- **Both S3 bucket policies condition on `AWS:SourceArn`** matching this one distribution.
  Without it the policy trusts any CloudFront distribution in any AWS account.
- **Do NOT commit on `main`.** Work on a branch; commit per task with a semantic message;
  push and open a PR only when asked. (Maintainer instruction, 2026-08-05.)
- **Verification gate for app-level changes:** `./node_modules/.bin/eslint .`,
  `npm run typecheck`, `npm test`, `npm run build`. Infrastructure tasks use
  `terraform fmt -check`, `terraform validate` and `actionlint` instead.
- **After the last task, run a code-review pass** before declaring the plan complete.

### Two deliberate deviations from the spec, and why

1. **ECR lives in `infra/bootstrap/`, not `infra/`.** The spec lists it under `infra/`, but
   the pipeline pushes the image *before* `terraform apply` (the container functions
   reference the tag), so on the very first deploy the repository would not exist yet. The
   alternatives are a targeted apply (`-target=aws_ecr_repository...`, a smell that hides
   drift) or a two-pass apply. ECR is create-once infrastructure, which is exactly what
   bootstrap is for.
2. **A CloudFront Function rewrites `/artifacts/*` as well as `/report/*`.** The scan worker
   writes keys as `audits/{id}/{file}` (spec §4.3) while the public URL is
   `/artifacts/{id}/{file}`. `origin_path` cannot express that — CloudFront *prepends* it,
   so `/artifacts/x.png` with origin path `/audits` becomes `/audits/artifacts/x.png`. One
   viewer-request function handles both rewrites. The alternative (changing the S3 key
   prefix to `artifacts/`) would mean touching already-merged app code.

Also note the correction already applied to the spec: the report shell is exported to
`out/report.html`, so the rewrite target is `/report.html`, **not** `/report/index.html`.

---

## File structure

```text
infra/bootstrap/
  versions.tf        provider + terraform version constraints, local backend
  main.tf            state bucket, OIDC provider, ECR repository
  deploy-role.tf     the GitHub Actions role and its policy
  outputs.tf         role ARN, state bucket name, ECR repository URL
infra/
  versions.tf        version constraints
  backend.tf         S3 backend, encrypt + use_lockfile
  variables.tf       image_tag, region, retention, github repo
  locals.tf          account id, derived bucket names, common tags
  dynamodb.tf        sitedoc_audits
  sqs.tf             sitedoc-scan + DLQ
  s3.tf              frontend + artifacts buckets, policies, lifecycle
  ssm.tf             two SecureString placeholders + public-base-url
  logs.tf            three pre-created log groups
  iam.tf             three runtime roles, one per function
  lambda.tf          three functions, function URLs, event source mapping
  cloudfront.tf      OACs, the rewrite function, the distribution
  outputs.tf         everything the deploy workflow and smoke test need
.github/workflows/
  aws-deploy.yml     build → approve → OIDC → push image → apply → sync → invalidate
scripts/
  smoke-aws.sh       parity smoke test against a deployed base URL
```

---

# Phase 5 — Infrastructure

At the end of this phase the AWS account holds a working deployment, applied from a
laptop, and the CloudFront URL serves the app.

---

### Task 1: Tooling and ignores **[agent]**

**Files:**
- Modify: `.gitignore`
- Modify: `README.md` (prerequisites)

**Interfaces:**
- Produces: an `aws` CLI in the dev container; Terraform working directories ignored by git.
- Consumes: nothing.

- [ ] **Step 1: Install the AWS CLI**

  The dev container does not have it (spec §7.3). Install v2 for linux-x86_64:

  ```bash
  cd /tmp && curl -sS "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip \
    && unzip -q awscliv2.zip && sudo ./aws/install --update && rm -rf /tmp/aws /tmp/awscliv2.zip
  ```

  Run: `aws --version`
  Expected: `aws-cli/2.x ...`. If `sudo` is unavailable, install to a user prefix with
  `./aws/install --install-dir ~/.aws-cli --bin-dir ~/.local/bin --update`.

- [ ] **Step 2: Ignore Terraform working state**

  Add to `.gitignore`:

  ```gitignore
  # Terraform
  **/.terraform/*
  *.tfstate
  *.tfstate.*
  crash.log
  crash.*.log
  *.tfvars
  *.tfvars.json
  override.tf
  override.tf.json
  *_override.tf
  *_override.tf.json
  .terraform.lock.hcl.bak
  ```

  **Do not ignore `.terraform.lock.hcl`** — the provider lock file is committed on purpose,
  so CI resolves the same provider versions a human did.

- [ ] **Step 3: Record the prerequisite in the README**

  In `README.md`, under the deployment section, add:

  ```markdown
  Deploying requires Terraform 1.11+, the AWS CLI v2, and Docker. Infrastructure lives in
  `infra/` (applied by CI) and `infra/bootstrap/` (applied once by hand).
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add .gitignore README.md
  git commit -m "chore(infra): ignore terraform working state and note the toolchain"
  ```

---

### Task 2: Bootstrap stack **[agent]**

Everything a pipeline cannot create for itself. Applied once, by hand, with a temporary
credential; after that every deploy is keyless.

**Files:**
- Create: `infra/bootstrap/versions.tf`
- Create: `infra/bootstrap/main.tf`
- Create: `infra/bootstrap/deploy-role.tf`
- Create: `infra/bootstrap/outputs.tf`

**Interfaces:**
- Produces: `sitedoc-tfstate-<account_id>` (state bucket), an IAM OIDC provider for
  `token.actions.githubusercontent.com`, the `sitedoc-deploy` role, and the
  `sitedoc-browser` ECR repository. Outputs `deploy_role_arn`, `state_bucket`,
  `ecr_repository_url`.
- Consumes: nothing.

- [ ] **Step 1: Version constraints and provider**

  Create `infra/bootstrap/versions.tf`:

  ```hcl
  terraform {
    required_version = ">= 1.11.0"

    required_providers {
      aws = {
        source  = "hashicorp/aws"
        version = "~> 6.0"
      }
    }

    # Local state on purpose: this stack creates the bucket the other stack's state
    # lives in. Its own state is small, recreatable, and holds no secrets.
  }

  provider "aws" {
    region = var.region

    default_tags {
      tags = {
        Project   = "sitedoc-ai"
        ManagedBy = "terraform"
        Stack     = "bootstrap"
      }
    }
  }

  variable "region" {
    description = "Single region for the whole deployment."
    type        = string
    default     = "us-east-1"
  }

  variable "github_repo" {
    description = "owner/name of the repository allowed to assume the deploy role."
    type        = string
    default     = "kyle41io/SiteDoc-AI"
  }

  data "aws_caller_identity" "current" {}
  ```

- [ ] **Step 2: State bucket, OIDC provider, ECR**

  Create `infra/bootstrap/main.tf`:

  ```hcl
  locals {
    account_id   = data.aws_caller_identity.current.account_id
    state_bucket = "sitedoc-tfstate-${local.account_id}"
  }

  # --- Terraform state -------------------------------------------------------
  # Bucket names are globally unique, hence the account-id suffix. Versioning is
  # what makes a corrupted or half-written state recoverable.
  resource "aws_s3_bucket" "state" {
    bucket = local.state_bucket
  }

  resource "aws_s3_bucket_versioning" "state" {
    bucket = aws_s3_bucket.state.id

    versioning_configuration {
      status = "Enabled"
    }
  }

  resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
    bucket = aws_s3_bucket.state.id

    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }

  resource "aws_s3_bucket_public_access_block" "state" {
    bucket                  = aws_s3_bucket.state.id
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
  }

  # --- GitHub OIDC -----------------------------------------------------------
  # The thumbprints below are GitHub's well-known intermediate CA fingerprints.
  # AWS no longer validates them for this issuer, but the API still requires at
  # least one, so both published values are listed rather than fetched at plan
  # time (which would make every plan depend on a live TLS handshake).
  resource "aws_iam_openid_connect_provider" "github" {
    url             = "https://token.actions.githubusercontent.com"
    client_id_list  = ["sts.amazonaws.com"]
    thumbprint_list = [
      "6938fd4d98bab03faadb97b34396831e3780aea1",
      "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
    ]
  }

  # --- ECR -------------------------------------------------------------------
  # In bootstrap, not the main stack: the pipeline pushes the image *before*
  # `terraform apply`, because the container functions reference the tag. See the
  # deviation note at the top of this plan.
  resource "aws_ecr_repository" "browser" {
    name                 = "sitedoc-browser"
    image_tag_mutability = "IMMUTABLE" # tags are git SHAs; never overwrite one

    image_scanning_configuration {
      scan_on_push = true
    }
  }

  # ECR private storage is the one line item this architecture pays for after the
  # first year. Keeping three images holds it near $0.10-0.30/month instead of
  # growing with every deploy.
  resource "aws_ecr_lifecycle_policy" "browser" {
    repository = aws_ecr_repository.browser.name

    policy = jsonencode({
      rules = [{
        rulePriority = 1
        description  = "Keep only the last 3 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 3
        }
        action = { type = "expire" }
      }]
    })
  }
  ```

- [ ] **Step 3: The deploy role**

  Create `infra/bootstrap/deploy-role.tf`:

  ```hcl
  # Trust policy. Two details that cost real debugging time if wrong:
  #  - `sub` is pinned to the *environment* form. GitHub swaps the claim to
  #    `repo:owner/name:environment:production` when a job declares
  #    `environment:`, and matching only that form is what stops a future
  #    workflow from assuming this role straight off `main` and skipping the
  #    approval gate.
  #  - `aud` must be checked too, or any GitHub workflow anywhere could present a
  #    token minted for a different audience.
  data "aws_iam_policy_document" "deploy_trust" {
    statement {
      effect  = "Allow"
      actions = ["sts:AssumeRoleWithWebIdentity"]

      principals {
        type        = "Federated"
        identifiers = [aws_iam_openid_connect_provider.github.arn]
      }

      condition {
        test     = "StringEquals"
        variable = "token.actions.githubusercontent.com:aud"
        values   = ["sts.amazonaws.com"]
      }

      condition {
        test     = "StringEquals"
        variable = "token.actions.githubusercontent.com:sub"
        values   = ["repo:${var.github_repo}:environment:production"]
      }
    }
  }

  resource "aws_iam_role" "deploy" {
    name               = "sitedoc-deploy"
    description        = "GitHub Actions deploy role for SiteDoc AI"
    assume_role_policy = data.aws_iam_policy_document.deploy_trust.json
  }

  # Read actions are broadened per service so a plan never fails on a missing
  # Describe/Get; mutating actions stay enumerated. `ssm:DescribeParameters` and
  # `logs:DescribeLogGroups` cannot be resource-scoped and return metadata only.
  # CloudFront has no resource-level IAM at all, hence `*` with a curated action
  # list.
  data "aws_iam_policy_document" "deploy" {
    statement {
      sid    = "TerraformState"
      effect = "Allow"
      actions = [
        "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket",
        "s3:GetBucketVersioning", "s3:GetBucketLocation",
      ]
      resources = [
        aws_s3_bucket.state.arn,
        "${aws_s3_bucket.state.arn}/*",
      ]
    }

    statement {
      sid    = "SiteBuckets"
      effect = "Allow"
      actions = [
        "s3:Get*", "s3:List*",
        "s3:CreateBucket", "s3:PutBucketPolicy", "s3:PutBucketVersioning",
        "s3:PutBucketPublicAccessBlock", "s3:PutBucketOwnershipControls",
        "s3:PutBucketTagging", "s3:PutEncryptionConfiguration",
        "s3:PutLifecycleConfiguration", "s3:DeleteBucketPolicy",
        "s3:PutObject", "s3:DeleteObject", "s3:PutObjectAcl",
      ]
      resources = [
        "arn:aws:s3:::sitedoc-frontend-${local.account_id}",
        "arn:aws:s3:::sitedoc-frontend-${local.account_id}/*",
        "arn:aws:s3:::sitedoc-artifacts-${local.account_id}",
        "arn:aws:s3:::sitedoc-artifacts-${local.account_id}/*",
      ]
    }

    statement {
      sid    = "Dynamo"
      effect = "Allow"
      actions = [
        "dynamodb:Describe*", "dynamodb:List*",
        "dynamodb:CreateTable", "dynamodb:UpdateTable", "dynamodb:DeleteTable",
        "dynamodb:UpdateTimeToLive", "dynamodb:TagResource", "dynamodb:UntagResource",
      ]
      resources = ["arn:aws:dynamodb:${var.region}:${local.account_id}:table/sitedoc_audits"]
    }

    statement {
      sid    = "Queues"
      effect = "Allow"
      actions = [
        "sqs:Get*", "sqs:List*",
        "sqs:CreateQueue", "sqs:SetQueueAttributes", "sqs:DeleteQueue",
        "sqs:TagQueue", "sqs:UntagQueue",
      ]
      resources = ["arn:aws:sqs:${var.region}:${local.account_id}:sitedoc-scan*"]
    }

    statement {
      sid    = "Images"
      effect = "Allow"
      actions = [
        "ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:Describe*",
        "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload", "ecr:PutImage",
      ]
      resources = ["*"] # GetAuthorizationToken has no resource
    }

    statement {
      sid    = "Functions"
      effect = "Allow"
      actions = [
        "lambda:Get*", "lambda:List*",
        "lambda:CreateFunction", "lambda:DeleteFunction", "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration", "lambda:PublishVersion",
        "lambda:TagResource", "lambda:UntagResource",
        "lambda:AddPermission", "lambda:RemovePermission",
        "lambda:CreateFunctionUrlConfig", "lambda:UpdateFunctionUrlConfig",
        "lambda:DeleteFunctionUrlConfig",
        "lambda:CreateEventSourceMapping", "lambda:UpdateEventSourceMapping",
        "lambda:DeleteEventSourceMapping",
        "lambda:PutFunctionConcurrency", "lambda:DeleteFunctionConcurrency",
      ]
      resources = ["*"] # event source mappings are identified by UUID, not name
    }

    statement {
      sid    = "RuntimeRoles"
      effect = "Allow"
      actions = [
        "iam:Get*", "iam:List*",
        "iam:CreateRole", "iam:DeleteRole", "iam:TagRole", "iam:UntagRole",
        "iam:PutRolePolicy", "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy", "iam:DetachRolePolicy",
        "iam:UpdateAssumeRolePolicy", "iam:PassRole",
      ]
      resources = ["arn:aws:iam::${local.account_id}:role/sitedoc-*"]
    }

    statement {
      sid    = "Logs"
      effect = "Allow"
      actions = [
        "logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy",
        "logs:TagResource", "logs:UntagResource", "logs:ListTagsForResource",
        "logs:DescribeLogStreams",
      ]
      # BOTH ARN forms, deliberately: group-level calls (CreateLogGroup,
      # PutRetentionPolicy, TagResource) need the bare form, and the `:*` form
      # only matches streams. Omitting either produces an AccessDenied that looks
      # like a policy typo.
      resources = [
        "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/sitedoc-*",
        "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/sitedoc-*:*",
      ]
    }

    statement {
      sid       = "LogDiscovery"
      effect    = "Allow"
      actions   = ["logs:DescribeLogGroups"]
      resources = ["*"] # cannot be resource-scoped; returns metadata only
    }

    statement {
      sid    = "Parameters"
      effect = "Allow"
      actions = [
        "ssm:GetParameter", "ssm:GetParameters", "ssm:PutParameter",
        "ssm:DeleteParameter", "ssm:AddTagsToResource",
        "ssm:ListTagsForResource",
      ]
      resources = ["arn:aws:ssm:${var.region}:${local.account_id}:parameter/sitedoc-ai/*"]
    }

    statement {
      sid       = "ParameterDiscovery"
      effect    = "Allow"
      actions   = ["ssm:DescribeParameters"]
      resources = ["*"] # cannot be resource-scoped; returns metadata only
    }

    statement {
      sid    = "Edge"
      effect = "Allow"
      actions = [
        "cloudfront:Get*", "cloudfront:List*",
        "cloudfront:CreateDistribution", "cloudfront:UpdateDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:CreateOriginAccessControl", "cloudfront:UpdateOriginAccessControl",
        "cloudfront:DeleteOriginAccessControl",
        "cloudfront:CreateFunction", "cloudfront:UpdateFunction",
        "cloudfront:PublishFunction", "cloudfront:DeleteFunction",
        "cloudfront:CreateInvalidation",
        "cloudfront:TagResource", "cloudfront:UntagResource",
      ]
      resources = ["*"] # CloudFront has no resource-level IAM
    }
  }

  resource "aws_iam_role_policy" "deploy" {
    name   = "sitedoc-deploy"
    role   = aws_iam_role.deploy.id
    policy = data.aws_iam_policy_document.deploy.json
  }
  ```

- [ ] **Step 4: Outputs**

  Create `infra/bootstrap/outputs.tf`:

  ```hcl
  output "deploy_role_arn" {
    description = "Set as the AWS_ROLE_ARN variable on the GitHub production environment."
    value       = aws_iam_role.deploy.arn
  }

  output "state_bucket" {
    description = "Bucket name for infra/backend.tf."
    value       = aws_s3_bucket.state.id
  }

  output "ecr_repository_url" {
    description = "Push target for the browser image."
    value       = aws_ecr_repository.browser.repository_url
  }
  ```

- [ ] **Step 5: Validate without credentials**

  ```bash
  cd infra/bootstrap
  terraform init -backend=false
  terraform fmt -check
  terraform validate
  cd -
  ```
  Expected: `Success! The configuration is valid.` and no `fmt` diff. `validate` needs the
  provider schema (downloaded by `init`) but no credentials.

- [ ] **Step 6: Commit**

  ```bash
  git add infra/bootstrap .terraform.lock.hcl infra/bootstrap/.terraform.lock.hcl
  git commit -m "feat(infra): add the bootstrap stack (state, OIDC, deploy role, ECR)"
  ```

---

### Task 3: Main stack skeleton **[agent]**

**Files:**
- Create: `infra/versions.tf`
- Create: `infra/backend.tf`
- Create: `infra/variables.tf`
- Create: `infra/locals.tf`

**Interfaces:**
- Produces: `var.image_tag`, `var.region`, `var.retention_days`,
  `var.log_retention_days`, `var.github_repo`; `local.account_id`,
  `local.frontend_bucket`, `local.artifacts_bucket`, `local.ssm_prefix`,
  `local.name_prefix`.
- Consumes: the state bucket from Task 2.

- [ ] **Step 1: Version constraints**

  Create `infra/versions.tf`:

  ```hcl
  terraform {
    required_version = ">= 1.11.0"

    required_providers {
      aws = {
        source  = "hashicorp/aws"
        version = "~> 6.0"
      }
    }
  }

  provider "aws" {
    region = var.region

    default_tags {
      tags = {
        Project   = "sitedoc-ai"
        ManagedBy = "terraform"
        Stack     = "app"
      }
    }
  }
  ```

  If `terraform init` reports that no version matches `~> 6.0`, bump the constraint to the
  current major and re-run `validate` — do not widen it to `>= 6.0`.

- [ ] **Step 2: Backend**

  Create `infra/backend.tf`:

  ```hcl
  # `use_lockfile` is the native S3 lockfile from Terraform 1.11: it replaces the
  # DynamoDB lock table older guides prescribe, so there is no extra resource to
  # create, pay for or forget.
  #
  # The bucket name is not interpolatable here — backend blocks cannot use
  # variables — so it is passed at init time:
  #   terraform init -backend-config="bucket=sitedoc-tfstate-<account_id>"
  terraform {
    backend "s3" {
      key          = "app/terraform.tfstate"
      region       = "us-east-1"
      encrypt      = true
      use_lockfile = true
    }
  }
  ```

- [ ] **Step 3: Variables**

  Create `infra/variables.tf`:

  ```hcl
  variable "region" {
    description = "Single region for the whole deployment."
    type        = string
    default     = "us-east-1"
  }

  variable "image_tag" {
    description = "Git SHA of the browser image already pushed to ECR."
    type        = string

    validation {
      condition     = can(regex("^[0-9a-f]{7,40}$", var.image_tag))
      error_message = "image_tag must be a git SHA — a moving tag like 'latest' would make deploys unreproducible."
    }
  }

  variable "retention_days" {
    description = "How long audit records and screenshots live."
    type        = number
    default     = 30
  }

  variable "log_retention_days" {
    description = "CloudWatch Logs retention. Never 'never' — that is a silent bill."
    type        = number
    default     = 14
  }

  variable "github_repo" {
    description = "owner/name, used only for tagging and documentation here."
    type        = string
    default     = "kyle41io/SiteDoc-AI"
  }
  ```

- [ ] **Step 4: Locals**

  Create `infra/locals.tf`:

  ```hcl
  data "aws_caller_identity" "current" {}

  # The AWS-managed key SSM uses for SecureString parameters. The scan role gets
  # an explicit kms:Decrypt on it rather than relying on the managed key's
  # default account-wide policy.
  data "aws_kms_alias" "ssm" {
    name = "alias/aws/ssm"
  }

  data "aws_ecr_repository" "browser" {
    name = "sitedoc-browser" # created in infra/bootstrap
  }

  locals {
    account_id  = data.aws_caller_identity.current.account_id
    name_prefix = "sitedoc"

    # Bucket names are globally unique, hence the account-id suffix.
    frontend_bucket  = "sitedoc-frontend-${local.account_id}"
    artifacts_bucket = "sitedoc-artifacts-${local.account_id}"

    table_name = "sitedoc_audits"
    ssm_prefix = "/sitedoc-ai"

    image_uri = "${data.aws_ecr_repository.browser.repository_url}:${var.image_tag}"
  }
  ```

- [ ] **Step 5: Validate**

  ```bash
  cd infra && terraform init -backend=false && terraform fmt -check && terraform validate; cd -
  ```
  Expected: valid. (With no resources yet, this only proves the syntax and provider
  constraints are sound.)

- [ ] **Step 6: Commit**

  ```bash
  git add infra
  git commit -m "feat(infra): add the main stack skeleton, backend and variables"
  ```

---

### Task 4: Data stores **[agent]**

**Files:**
- Create: `infra/dynamodb.tf`
- Create: `infra/sqs.tf`
- Create: `infra/s3.tf`

**Interfaces:**
- Produces: `aws_dynamodb_table.audits`, `aws_sqs_queue.scan`, `aws_sqs_queue.scan_dlq`,
  `aws_s3_bucket.frontend`, `aws_s3_bucket.artifacts`.
- Consumes: `local.*` from Task 3. The bucket policies consume
  `aws_cloudfront_distribution.main.arn` from Task 8 — write them in Task 8's file, not
  here, so this task validates on its own.

- [ ] **Step 1: DynamoDB**

  Create `infra/dynamodb.tf`:

  ```hcl
  # Every access pattern in the app is "get this audit by id" or "overwrite this
  # audit" — exactly a partition key. No GSI: nothing queries across audits, and
  # one will be added when a real access pattern needs it.
  #
  # On-demand billing is genuinely $0 while idle, and 25 GB of storage is always
  # free. RDS would bill per instance-hour and drag Lambda into VPC networking
  # (ENI cold starts, NAT charges) for no benefit.
  resource "aws_dynamodb_table" "audits" {
    name         = local.table_name
    billing_mode = "PAY_PER_REQUEST"
    hash_key     = "pk"
    range_key    = "sk"

    attribute {
      name = "pk"
      type = "S"
    }

    attribute {
      name = "sk"
      type = "S"
    }

    # DynamoDB expires items itself, free. No cleanup Lambda to write, deploy,
    # monitor or pay for. The S3 lifecycle rule uses the same window so records
    # and screenshots disappear together.
    ttl {
      attribute_name = "ttl"
      enabled        = true
    }
  }
  ```

  Note: no `point_in_time_recovery` — an accepted gap for a portfolio project with a 30-day
  window (spec §11), and non-negotiable if this ever holds customer data.

- [ ] **Step 2: SQS**

  Create `infra/sqs.tf`:

  ```hcl
  resource "aws_sqs_queue" "scan_dlq" {
    name                      = "${local.name_prefix}-scan-dlq"
    message_retention_seconds = 1209600 # 14 days, the maximum
  }

  # Visibility timeout must exceed the function timeout (300s) or SQS will hand
  # the same job to a second worker while the first is still scanning.
  resource "aws_sqs_queue" "scan" {
    name                       = "${local.name_prefix}-scan"
    visibility_timeout_seconds = 360

    redrive_policy = jsonencode({
      deadLetterTargetArn = aws_sqs_queue.scan_dlq.arn
      maxReceiveCount     = 2
    })
  }
  ```

- [ ] **Step 3: Buckets**

  Create `infra/s3.tf`:

  ```hcl
  resource "aws_s3_bucket" "frontend" {
    bucket = local.frontend_bucket
  }

  resource "aws_s3_bucket" "artifacts" {
    bucket = local.artifacts_bucket
  }

  # Both buckets are private and reachable only through CloudFront with OAC.
  # Nothing here is ever public: "block public access" is the backstop for a
  # future mistake in a bucket policy.
  resource "aws_s3_bucket_public_access_block" "frontend" {
    bucket                  = aws_s3_bucket.frontend.id
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
  }

  resource "aws_s3_bucket_public_access_block" "artifacts" {
    bucket                  = aws_s3_bucket.artifacts.id
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
  }

  resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
    bucket = aws_s3_bucket.frontend.id

    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }

  resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
    bucket = aws_s3_bucket.artifacts.id

    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }

  # Screenshots expire on the same 30-day schedule as the records they belong to.
  resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
    bucket = aws_s3_bucket.artifacts.id

    rule {
      id     = "expire-audit-artifacts"
      status = "Enabled"

      filter {
        prefix = "audits/"
      }

      expiration {
        days = var.retention_days
      }

      abort_incomplete_multipart_upload {
        days_after_initiation = 1
      }
    }
  }
  ```

- [ ] **Step 4: Validate**

  ```bash
  cd infra && terraform validate && terraform fmt -check; cd -
  ```
  Expected: valid.

- [ ] **Step 5: Commit**

  ```bash
  git add infra
  git commit -m "feat(infra): add DynamoDB, SQS and the two S3 buckets"
  ```

---

### Task 5: Parameters and log groups **[agent]**

**Files:**
- Create: `infra/ssm.tf`
- Create: `infra/logs.tf`

**Interfaces:**
- Produces: `aws_ssm_parameter.anthropic_key`, `aws_ssm_parameter.openai_key`,
  `aws_ssm_parameter.public_base_url`, and three `aws_cloudwatch_log_group` resources named
  `/aws/lambda/sitedoc-{api,scan,pdf}`.
- Consumes: `local.ssm_prefix`. `public_base_url` consumes the distribution domain from
  Task 8 — it is defined here but its `value` references Task 8's resource, so this file
  only validates once Task 8 exists. Write it now and expect `validate` to fail until then,
  or add Task 8 first if working out of order.

- [ ] **Step 1: Parameters**

  Create `infra/ssm.tf`:

  ```hcl
  # Standard parameters are free; Secrets Manager is $0.40 per secret per month
  # and its differentiators (rotation, cross-account resource policies) are not
  # needed here. With rotation as a requirement this decision reverses.
  #
  # The values are placeholders and Terraform is told to ignore them forever:
  # state stores every managed attribute in plaintext, so a secret passed through
  # a variable is a secret written to state. Real values are set out-of-band:
  #   aws ssm put-parameter --name /sitedoc-ai/OPENAI_API_KEY --type SecureString \
  #     --value "sk-..." --overwrite
  resource "aws_ssm_parameter" "anthropic_key" {
    name  = "${local.ssm_prefix}/ANTHROPIC_API_KEY"
    type  = "SecureString"
    value = "placeholder-set-out-of-band"

    lifecycle {
      ignore_changes = [value]
    }
  }

  resource "aws_ssm_parameter" "openai_key" {
    name  = "${local.ssm_prefix}/OPENAI_API_KEY"
    type  = "SecureString"
    value = "placeholder-set-out-of-band"

    lifecycle {
      ignore_changes = [value]
    }
  }

  # The PDF renderer needs the public base URL to navigate, but the distribution
  # depends on the PDF function's URL — so passing the domain as a Lambda
  # environment variable is a dependency cycle. Terraform writes it here after
  # the distribution exists and the function reads it at cold start; a runtime
  # read is not a Terraform dependency, so the cycle disappears.
  resource "aws_ssm_parameter" "public_base_url" {
    name  = "${local.ssm_prefix}/public-base-url"
    type  = "String"
    value = "https://${aws_cloudfront_distribution.main.domain_name}"
  }
  ```

- [ ] **Step 2: Log groups**

  Create `infra/logs.tf`:

  ```hcl
  # Pre-created on purpose. Letting Lambda create its own log group on first
  # invocation yields an unmanaged group with never-expiring retention — a slow,
  # silent bill that Terraform does not know exists.
  resource "aws_cloudwatch_log_group" "api" {
    name              = "/aws/lambda/${local.name_prefix}-api"
    retention_in_days = var.log_retention_days
  }

  resource "aws_cloudwatch_log_group" "scan" {
    name              = "/aws/lambda/${local.name_prefix}-scan"
    retention_in_days = var.log_retention_days
  }

  resource "aws_cloudwatch_log_group" "pdf" {
    name              = "/aws/lambda/${local.name_prefix}-pdf"
    retention_in_days = var.log_retention_days
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add infra
  git commit -m "feat(infra): add SSM parameters and pre-created log groups"
  ```

  (`terraform validate` is run at the end of Task 8, once the distribution the base-URL
  parameter references exists.)

---
### Task 6: Runtime IAM roles **[agent]**

Three roles, one per function, each scoped to exactly the table, bucket prefix and
parameter path it needs. `sitedoc-pdf` can write nothing and cannot reach the AI keys.

**Files:**
- Create: `infra/iam.tf`

**Interfaces:**
- Produces: `aws_iam_role.api`, `aws_iam_role.scan`, `aws_iam_role.pdf`.
- Consumes: `aws_dynamodb_table.audits`, `aws_sqs_queue.scan`, `aws_s3_bucket.artifacts`,
  `aws_cloudwatch_log_group.*`, `data.aws_kms_alias.ssm`.

- [ ] **Step 1: Trust policy and the three roles**

  Create `infra/iam.tf`:

  ```hcl
  data "aws_iam_policy_document" "lambda_trust" {
    statement {
      effect  = "Allow"
      actions = ["sts:AssumeRole"]

      principals {
        type        = "Service"
        identifiers = ["lambda.amazonaws.com"]
      }
    }
  }

  resource "aws_iam_role" "api" {
    name               = "${local.name_prefix}-api"
    assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  }

  resource "aws_iam_role" "scan" {
    name               = "${local.name_prefix}-scan"
    assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  }

  resource "aws_iam_role" "pdf" {
    name               = "${local.name_prefix}-pdf"
    assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  }
  ```

- [ ] **Step 2: The API role's policy**

  Append to `infra/iam.tf`:

  ```hcl
  # Writing logs is granted explicitly against the pre-created group rather than
  # by attaching AWSLambdaBasicExecutionRole, which allows CreateLogGroup on `*`
  # — the exact behavior the pre-created groups exist to prevent.
  data "aws_iam_policy_document" "api" {
    statement {
      sid       = "Logs"
      effect    = "Allow"
      actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
    }

    statement {
      sid       = "Records"
      effect    = "Allow"
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
      resources = [aws_dynamodb_table.audits.arn]
    }

    statement {
      sid       = "Dispatch"
      effect    = "Allow"
      actions   = ["sqs:SendMessage"]
      resources = [aws_sqs_queue.scan.arn]
    }
  }

  resource "aws_iam_role_policy" "api" {
    name   = "${local.name_prefix}-api"
    role   = aws_iam_role.api.id
    policy = data.aws_iam_policy_document.api.json
  }
  ```

- [ ] **Step 3: The scan role's policy**

  Append to `infra/iam.tf`:

  ```hcl
  data "aws_iam_policy_document" "scan" {
    statement {
      sid       = "Logs"
      effect    = "Allow"
      actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      resources = ["${aws_cloudwatch_log_group.scan.arn}:*"]
    }

    statement {
      sid       = "Records"
      effect    = "Allow"
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
      resources = [aws_dynamodb_table.audits.arn]
    }

    # Write-only, and only under the one prefix the artifact store uses.
    statement {
      sid       = "Screenshots"
      effect    = "Allow"
      actions   = ["s3:PutObject"]
      resources = ["${aws_s3_bucket.artifacts.arn}/audits/*"]
    }

    statement {
      sid     = "Consume"
      effect  = "Allow"
      actions = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
      ]
      resources = [aws_sqs_queue.scan.arn]
    }

    # Only this function can read the AI keys.
    statement {
      sid       = "Secrets"
      effect    = "Allow"
      actions   = ["ssm:GetParameter", "ssm:GetParameters"]
      resources = ["arn:aws:ssm:${var.region}:${local.account_id}:parameter${local.ssm_prefix}/*"]
    }

    # Explicit rather than relying on the AWS-managed key's default policy, so
    # the grant is visible in one place and survives a tightened key policy.
    statement {
      sid       = "DecryptSecrets"
      effect    = "Allow"
      actions   = ["kms:Decrypt"]
      resources = [data.aws_kms_alias.ssm.target_key_arn]
    }
  }

  resource "aws_iam_role_policy" "scan" {
    name   = "${local.name_prefix}-scan"
    role   = aws_iam_role.scan.id
    policy = data.aws_iam_policy_document.scan.json
  }
  ```

- [ ] **Step 4: The PDF role's policy**

  Append to `infra/iam.tf`:

  ```hcl
  # No write permission of any kind, and no access to the secret parameters: this
  # function renders a report that already exists.
  data "aws_iam_policy_document" "pdf" {
    statement {
      sid       = "Logs"
      effect    = "Allow"
      actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      resources = ["${aws_cloudwatch_log_group.pdf.arn}:*"]
    }

    statement {
      sid       = "ReadRecords"
      effect    = "Allow"
      actions   = ["dynamodb:GetItem"]
      resources = [aws_dynamodb_table.audits.arn]
    }

    statement {
      sid       = "ReadBaseUrl"
      effect    = "Allow"
      actions   = ["ssm:GetParameter"]
      resources = ["arn:aws:ssm:${var.region}:${local.account_id}:parameter${local.ssm_prefix}/public-base-url"]
    }
  }

  resource "aws_iam_role_policy" "pdf" {
    name   = "${local.name_prefix}-pdf"
    role   = aws_iam_role.pdf.id
    policy = data.aws_iam_policy_document.pdf.json
  }
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add infra/iam.tf
  git commit -m "feat(infra): add one least-privilege runtime role per function"
  ```

---

### Task 7: Lambda functions **[agent]**

**Files:**
- Create: `infra/lambda.tf`

**Interfaces:**
- Produces: `aws_lambda_function.api`, `aws_lambda_function.scan`,
  `aws_lambda_function.pdf`, `aws_lambda_function_url.api`,
  `aws_lambda_function_url.pdf`, `aws_lambda_event_source_mapping.scan`.
- Consumes: the roles from Task 6, `local.image_uri`, and the esbuild output at
  `../dist-lambda/api/index.js` (built by `npm run bundle:lambda` before apply).

- [ ] **Step 1: Zip the API bundle**

  Create `infra/lambda.tf`:

  ```hcl
  # The zip is built from esbuild output rather than committed: `npm run
  # bundle:lambda` runs before `terraform apply`, in the pipeline and by hand.
  # `source_code_hash` is what makes a code-only change redeploy the function.
  data "archive_file" "api" {
    type        = "zip"
    source_file = "${path.module}/../dist-lambda/api/index.js"
    output_path = "${path.module}/.terraform/tmp/api.zip"
  }
  ```

  Add `archive` to `infra/versions.tf`'s `required_providers`:

  ```hcl
      archive = {
        source  = "hashicorp/archive"
        version = "~> 2.0"
      }
  ```

- [ ] **Step 2: The API function**

  Append to `infra/lambda.tf`:

  ```hcl
  # A small zip on the managed runtime, deliberately: this is the request a user
  # waits on, so it must cold-start in a couple of hundred milliseconds, and the
  # Chromium image must never be in that path.
  #
  # 15s rather than something tighter because `validatePublicHttpUrl` resolves
  # DNS for a user-supplied hostname, which is slow for a host that never
  # resolves.
  resource "aws_lambda_function" "api" {
    function_name = "${local.name_prefix}-api"
    role          = aws_iam_role.api.arn
    runtime       = "nodejs22.x"
    handler       = "index.handler"
    architectures = ["x86_64"]

    filename         = data.archive_file.api.output_path
    source_code_hash = data.archive_file.api.output_base64sha256

    memory_size = 512
    timeout     = 15

    environment {
      variables = {
        AUDIT_STORE       = "dynamo"
        SITEDOC_TABLE     = aws_dynamodb_table.audits.name
        SITEDOC_DISPATCH  = "sqs"
        SITEDOC_QUEUE_URL = aws_sqs_queue.scan.url
        NODE_OPTIONS      = "--enable-source-maps"
      }
    }

    # Without this the first invocation creates its own group with infinite
    # retention, and Terraform's group sits empty.
    depends_on = [aws_cloudwatch_log_group.api]
  }
  ```

- [ ] **Step 3: The scan worker**

  Append to `infra/lambda.tf`:

  ```hcl
  # 2048 MB gives ~1.2 vCPU and 4x Render's RAM, which retires the OOM-restart
  # problem and the SITEDOC_MAX_CONCURRENT_SCANS=1 cap. Lambda's always-free
  # 400,000 GB-seconds covers roughly 8,000 scans/month at 25s each.
  #
  # `AWS_REGION` is deliberately absent: it is reserved and injected by the
  # runtime, and setting it fails the update.
  resource "aws_lambda_function" "scan" {
    function_name = "${local.name_prefix}-scan"
    role          = aws_iam_role.scan.arn
    package_type  = "Image"
    image_uri     = local.image_uri
    architectures = ["x86_64"]

    memory_size = 2048
    timeout     = 300

    image_config {
      command = ["scan.handler"]
    }

    environment {
      variables = {
        AUDIT_STORE              = "dynamo"
        SITEDOC_TABLE            = aws_dynamodb_table.audits.name
        SITEDOC_ARTIFACTS        = "s3"
        SITEDOC_ARTIFACT_BUCKET  = aws_s3_bucket.artifacts.id
        SSM_PREFIX               = local.ssm_prefix
        SITEDOC_AXE_DIR          = "/var/task/node_modules/axe-core"
      }
    }

    depends_on = [aws_cloudwatch_log_group.scan]
  }

  # batch_size 1: one audit per invocation, so a retry re-runs exactly one scan.
  # maximum_concurrency 2 replaces the in-process concurrency cap.
  # ReportBatchItemFailures is what makes the handler's return value meaningful —
  # without it, one failed message redelivers its healthy neighbors too.
  resource "aws_lambda_event_source_mapping" "scan" {
    event_source_arn = aws_sqs_queue.scan.arn
    function_name    = aws_lambda_function.scan.arn
    batch_size       = 1

    function_response_types = ["ReportBatchItemFailures"]

    scaling_config {
      maximum_concurrency = 2
    }
  }
  ```

- [ ] **Step 4: The PDF renderer**

  Append to `infra/lambda.tf`:

  ```hcl
  # Same image, different command — one image to build, push and pay ECR storage
  # for. Reserved concurrency of 2 replaces the in-process `pdfsInFlight`
  # counter: a public endpoint that launches Chromium needs a hard ceiling.
  resource "aws_lambda_function" "pdf" {
    function_name = "${local.name_prefix}-pdf"
    role          = aws_iam_role.pdf.arn
    package_type  = "Image"
    image_uri     = local.image_uri
    architectures = ["x86_64"]

    memory_size                    = 2048
    timeout                        = 120
    reserved_concurrent_executions = 2

    image_config {
      command = ["pdf.handler"]
    }

    environment {
      variables = {
        AUDIT_STORE             = "dynamo"
        SITEDOC_TABLE           = aws_dynamodb_table.audits.name
        SITEDOC_BASE_URL_PARAM  = "${local.ssm_prefix}/public-base-url"
      }
    }

    depends_on = [aws_cloudwatch_log_group.pdf]
  }
  ```

- [ ] **Step 5: Function URLs and the CloudFront invoke grant**

  Append to `infra/lambda.tf`:

  ```hcl
  # AWS_IAM, not NONE: the URLs must not be publicly invocable. CloudFront signs
  # origin requests with SigV4 through OAC, which is the same trust mechanism the
  # S3 origins use. API Gateway is avoided because its 1M-request free tier
  # expires after 12 months, while Function URLs have no per-request charge ever.
  resource "aws_lambda_function_url" "api" {
    function_name      = aws_lambda_function.api.function_name
    authorization_type = "AWS_IAM"
  }

  resource "aws_lambda_function_url" "pdf" {
    function_name      = aws_lambda_function.pdf.function_name
    authorization_type = "AWS_IAM"
  }

  resource "aws_lambda_permission" "api_from_cloudfront" {
    statement_id           = "AllowCloudFrontInvokeUrl"
    action                 = "lambda:InvokeFunctionUrl"
    function_name          = aws_lambda_function.api.function_name
    principal              = "cloudfront.amazonaws.com"
    source_arn             = aws_cloudfront_distribution.main.arn
    function_url_auth_type = "AWS_IAM"
  }

  resource "aws_lambda_permission" "pdf_from_cloudfront" {
    statement_id           = "AllowCloudFrontInvokeUrl"
    action                 = "lambda:InvokeFunctionUrl"
    function_name          = aws_lambda_function.pdf.function_name
    principal              = "cloudfront.amazonaws.com"
    source_arn             = aws_cloudfront_distribution.main.arn
    function_url_auth_type = "AWS_IAM"
  }
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add infra
  git commit -m "feat(infra): add the three Lambda functions, URLs and SQS trigger"
  ```

---

### Task 8: CloudFront **[agent]**

The piece with the most ways to be subtly wrong. Behaviors are ordered most-specific first;
the rewrite function and the 403-only error mapping are both load-bearing.

**Files:**
- Create: `infra/cloudfront.tf`
- Create: `infra/cloudfront-rewrites.js`
- Create: `infra/outputs.tf`
- Modify: `infra/s3.tf` (bucket policies, now that the distribution ARN exists)

**Interfaces:**
- Produces: `aws_cloudfront_distribution.main`, and outputs `base_url`,
  `distribution_id`, `frontend_bucket`, `artifacts_bucket`, `queue_url`, `table_name`.
- Consumes: the buckets from Task 4 and the function URLs from Task 7.

- [ ] **Step 1: The rewrite function**

  Create `infra/cloudfront-rewrites.js`:

  ```js
  // Viewer-request function, attached to the /report/* and /artifacts/* behaviors.
  //
  // Two rewrites, both structural:
  //  - /report/<id> -> /report.html. A dynamic segment cannot be statically
  //    exported, so one exported shell serves every report and fetches its own
  //    record. Next writes that shell to `report.html`; `report/` holds only RSC
  //    payloads, so pointing at /report/index.html returns the wrong bytes.
  //  - /artifacts/<id>/<file> -> /audits/<id>/<file>. The scan worker writes S3
  //    keys under `audits/`, while the public URL says `artifacts/`. `origin_path`
  //    cannot express this: CloudFront prepends it, so it would produce
  //    /audits/artifacts/<id>/<file>.
  function handler(event) {
    var request = event.request;
    var uri = request.uri;

    if (uri.startsWith("/report/")) {
      request.uri = "/report.html";
    } else if (uri.startsWith("/artifacts/")) {
      request.uri = "/audits/" + uri.slice("/artifacts/".length);
    }

    return request;
  }
  ```

- [ ] **Step 2: Origin access controls and the distribution**

  Create `infra/cloudfront.tf`:

  ```hcl
  resource "aws_cloudfront_function" "rewrites" {
    name    = "${local.name_prefix}-rewrites"
    runtime = "cloudfront-js-2.0"
    publish = true
    code    = file("${path.module}/cloudfront-rewrites.js")
  }

  resource "aws_cloudfront_origin_access_control" "s3" {
    name                              = "${local.name_prefix}-s3"
    origin_access_control_origin_type = "s3"
    signing_behavior                  = "always"
    signing_protocol                  = "sigv4"
  }

  # Separate OAC for the Function URLs: the origin type differs, and SigV4 over a
  # Lambda URL signs a different canonical request than over S3.
  resource "aws_cloudfront_origin_access_control" "lambda" {
    name                              = "${local.name_prefix}-lambda"
    origin_access_control_origin_type = "lambda"
    signing_behavior                  = "always"
    signing_protocol                  = "sigv4"
  }

  # AWS-managed policy ids, stable across accounts.
  locals {
    cache_optimized      = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
    cache_disabled       = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
    origin_all_but_host  = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
  }

  resource "aws_cloudfront_distribution" "main" {
    enabled             = true
    comment             = "SiteDoc AI"
    default_root_object = "index.html"
    price_class         = "PriceClass_100"
    http_version        = "http2and3"

    # --- Origins -------------------------------------------------------------
    origin {
      origin_id                = "frontend"
      domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
      origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
    }

    origin {
      origin_id                = "artifacts"
      domain_name              = aws_s3_bucket.artifacts.bucket_regional_domain_name
      origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
    }

    origin {
      origin_id                = "api"
      domain_name              = replace(replace(aws_lambda_function_url.api.function_url, "https://", ""), "/", "")
      origin_access_control_id = aws_cloudfront_origin_access_control.lambda.id

      custom_origin_config {
        origin_protocol_policy = "https-only"
        http_port              = 80
        https_port             = 443
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }

    origin {
      origin_id                = "pdf"
      domain_name              = replace(replace(aws_lambda_function_url.pdf.function_url, "https://", ""), "/", "")
      origin_access_control_id = aws_cloudfront_origin_access_control.lambda.id

      custom_origin_config {
        origin_protocol_policy = "https-only"
        http_port              = 80
        https_port             = 443
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }

    # --- Behaviors, most specific first --------------------------------------
    # `AllViewerExceptHostHeader` is mandatory on the Lambda origins: forwarding
    # the viewer Host header breaks the SigV4 signature, and the failure looks
    # like a 403 from Lambda rather than a routing mistake.
    ordered_cache_behavior {
      path_pattern             = "/api/*"
      target_origin_id         = "api"
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      cache_policy_id          = local.cache_disabled
      origin_request_policy_id = local.origin_all_but_host
      compress                 = true
    }

    ordered_cache_behavior {
      path_pattern             = "/pdf/*"
      target_origin_id         = "pdf"
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS"]
      cached_methods           = ["GET", "HEAD"]
      cache_policy_id          = local.cache_disabled
      origin_request_policy_id = local.origin_all_but_host
      compress                 = true
    }

    # Immutable PNGs, edge-cached, never touching compute.
    ordered_cache_behavior {
      path_pattern           = "/artifacts/*"
      target_origin_id       = "artifacts"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD"]
      cached_methods         = ["GET", "HEAD"]
      cache_policy_id        = local.cache_optimized
      compress               = true

      function_association {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.rewrites.arn
      }
    }

    # `/report/*`, not `/report*`: the latter would also capture an unrelated path
    # such as /reporting. A bare `/report` with no id falls through to the default
    # behavior and resolves to the 404 page, which is correct — a report without
    # an id does not exist.
    ordered_cache_behavior {
      path_pattern           = "/report/*"
      target_origin_id       = "frontend"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD"]
      cached_methods         = ["GET", "HEAD"]
      cache_policy_id        = local.cache_optimized
      compress               = true

      function_association {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.rewrites.arn
      }
    }

    default_cache_behavior {
      target_origin_id       = "frontend"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD"]
      cached_methods         = ["GET", "HEAD"]
      cache_policy_id        = local.cache_optimized
      compress               = true
    }

    # --- Errors --------------------------------------------------------------
    # Only 403 is mapped, deliberately. S3 with OAC returns 403 for a missing key
    # (there is no s3:ListBucket grant), so this covers unknown pages. 404 is left
    # alone because `GET /api/audits?id=` legitimately returns a JSON 404 for an
    # unknown audit, and custom error responses are distribution-wide — mapping
    # 404 would replace that JSON body with an HTML page and break the client's
    # not-found handling.
    custom_error_response {
      error_code            = 403
      response_code         = 404
      response_page_path    = "/404.html"
      error_caching_min_ttl = 10
    }

    restrictions {
      geo_restriction {
        restriction_type = "none"
      }
    }

    # The default *.cloudfront.net certificate. A custom domain would add a Route
    # 53 hosted zone at $0.50/month — the only recurring line item in this design.
    viewer_certificate {
      cloudfront_default_certificate = true
    }
  }
  ```

- [ ] **Step 3: Bucket policies**

  Append to `infra/s3.tf`:

  ```hcl
  # `AWS:SourceArn` conditioned on this one distribution. Without that condition
  # the policy trusts any CloudFront distribution in any AWS account — the
  # confused-deputy hole in S3-behind-CloudFront setups.
  data "aws_iam_policy_document" "frontend" {
    statement {
      sid       = "AllowCloudFrontRead"
      effect    = "Allow"
      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.frontend.arn}/*"]

      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }

      condition {
        test     = "StringEquals"
        variable = "AWS:SourceArn"
        values   = [aws_cloudfront_distribution.main.arn]
      }
    }
  }

  data "aws_iam_policy_document" "artifacts" {
    statement {
      sid       = "AllowCloudFrontRead"
      effect    = "Allow"
      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.artifacts.arn}/*"]

      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }

      condition {
        test     = "StringEquals"
        variable = "AWS:SourceArn"
        values   = [aws_cloudfront_distribution.main.arn]
      }
    }
  }

  resource "aws_s3_bucket_policy" "frontend" {
    bucket = aws_s3_bucket.frontend.id
    policy = data.aws_iam_policy_document.frontend.json
  }

  resource "aws_s3_bucket_policy" "artifacts" {
    bucket = aws_s3_bucket.artifacts.id
    policy = data.aws_iam_policy_document.artifacts.json
  }
  ```

- [ ] **Step 4: Outputs**

  Create `infra/outputs.tf`:

  ```hcl
  output "base_url" {
    description = "Public entry point. Also written to SSM for the PDF renderer."
    value       = "https://${aws_cloudfront_distribution.main.domain_name}"
  }

  output "distribution_id" {
    description = "Needed by the deploy workflow's invalidation step."
    value       = aws_cloudfront_distribution.main.id
  }

  output "frontend_bucket" {
    description = "Sync target for the static export."
    value       = aws_s3_bucket.frontend.id
  }

  output "artifacts_bucket" {
    value = aws_s3_bucket.artifacts.id
  }

  output "queue_url" {
    value = aws_sqs_queue.scan.url
  }

  output "table_name" {
    value = aws_dynamodb_table.audits.name
  }
  ```

- [ ] **Step 5: Validate the whole stack**

  ```bash
  npm run bundle:lambda   # archive_file needs dist-lambda/api/index.js to exist
  cd infra && terraform init -backend=false && terraform fmt -check && terraform validate; cd -
  ```
  Expected: `Success! The configuration is valid.`

  If `validate` reports a cycle, check that no Lambda environment variable references the
  distribution — the base URL must travel through SSM (Task 5), not through an env var.

- [ ] **Step 6: Commit**

  ```bash
  git add infra
  git commit -m "feat(infra): add the CloudFront distribution, rewrites and bucket policies"
  ```

---

### Task 9: Bootstrap apply **[maintainer]**

Requires a temporary AWS credential. An agent must stop here.

- [ ] **Step 1: Deal with the compromised key first**

  The access key pasted into the design conversation is considered compromised. In the AWS
  console (IAM → Users → Security credentials): **deactivate, then delete it.** Do this
  before creating anything new.

- [ ] **Step 2: Create a temporary key for this one apply**

  Create a fresh access key for a user with administrative permissions, then:

  ```bash
  aws configure --profile sitedoc-bootstrap   # paste key, secret, us-east-1, json
  aws sts get-caller-identity --profile sitedoc-bootstrap
  ```
  Expected: your account id and user ARN.

- [ ] **Step 3: Apply the bootstrap stack**

  ```bash
  cd infra/bootstrap
  AWS_PROFILE=sitedoc-bootstrap terraform init
  AWS_PROFILE=sitedoc-bootstrap terraform apply
  ```
  Expected: 8-ish resources created, and three outputs. Record all three:

  ```bash
  AWS_PROFILE=sitedoc-bootstrap terraform output
  ```

- [ ] **Step 4: Set the two AI keys out-of-band**

  These are the values Terraform must never see. The parameters do not exist until the main
  stack is applied, so this step runs **after** Task 10 — it is listed here so the
  credential is still at hand:

  ```bash
  # Run after Task 10.
  aws ssm put-parameter --profile sitedoc-bootstrap --overwrite \
    --name /sitedoc-ai/ANTHROPIC_API_KEY --type SecureString --value "sk-ant-..."
  aws ssm put-parameter --profile sitedoc-bootstrap --overwrite \
    --name /sitedoc-ai/OPENAI_API_KEY --type SecureString --value "sk-..."
  ```

- [ ] **Step 5: Delete the temporary key once Task 10 succeeds**

  Once the OIDC role exists and the first apply has run, nothing needs a long-lived key
  again. Delete it in the console and remove the local profile:

  ```bash
  aws configure --profile sitedoc-bootstrap set aws_access_key_id ""
  aws configure --profile sitedoc-bootstrap set aws_secret_access_key ""
  ```

  No AWS credential is committed, and none is written into a Terraform variable or state.

---

### Task 10: First apply and the OAC-with-POST verification **[maintainer]**

This is where spec risk #1 is settled: whether CloudFront OAC signs origin requests that
carry a body.

- [ ] **Step 1: Build every artifact the apply needs**

  ```bash
  npm ci
  npm run build             # out/
  npm run bundle:lambda     # dist-lambda/{api,scan,pdf}/index.js
  ```

- [ ] **Step 2: Push the browser image**

  ```bash
  ACCOUNT=$(aws sts get-caller-identity --profile sitedoc-bootstrap --query Account --output text)
  SHA=$(git rev-parse --short HEAD)
  REPO="$ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/sitedoc-browser"

  aws ecr get-login-password --profile sitedoc-bootstrap --region us-east-1 \
    | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.us-east-1.amazonaws.com"
  docker build -f Dockerfile.lambda -t "$REPO:$SHA" .
  docker push "$REPO:$SHA"
  ```
  Expected: the push completes and `aws ecr describe-images --repository-name sitedoc-browser`
  lists the tag.

- [ ] **Step 3: Apply the main stack**

  ```bash
  cd infra
  AWS_PROFILE=sitedoc-bootstrap terraform init \
    -backend-config="bucket=sitedoc-tfstate-$ACCOUNT"
  AWS_PROFILE=sitedoc-bootstrap terraform apply -var="image_tag=$SHA"
  ```
  Expected: ~35 resources created. The distribution takes several minutes to deploy.

- [ ] **Step 4: Upload the frontend and note the URL**

  ```bash
  BUCKET=$(AWS_PROFILE=sitedoc-bootstrap terraform output -raw frontend_bucket)
  BASE=$(AWS_PROFILE=sitedoc-bootstrap terraform output -raw base_url)
  aws s3 sync ../out "s3://$BUCKET" --delete --profile sitedoc-bootstrap
  echo "$BASE"
  ```

- [ ] **Step 5: Verify OAC signing for a POST with a body**

  This is the risk. Run:

  ```bash
  curl -sS -i -X POST "$BASE/api/audits" \
    -H 'content-type: application/json' \
    -d '{"url":"https://example.com","language":"en"}' | head -20
  ```

  Expected: `HTTP/2 202` and a JSON body with `"status":"queued"`.

  **If it returns 403 with an `x-amz` signature error**, OAC cannot sign bodied requests in
  this configuration. Apply the fallback from spec §11.1 rather than debugging further:
  set both Function URLs to `authorization_type = "NONE"`, add a
  `custom_header { name = "x-sitedoc-origin", value = <random_password.origin.result> }` to
  the `api` and `pdf` origins, and reject requests missing that header in
  `lambda/http.ts`. Record which path was taken in the PR description — the spec's decision
  log depends on knowing.

- [ ] **Step 6: Confirm the scan completed**

  ```bash
  ID=<id from step 5>
  curl -s "$BASE/api/audits?id=$ID" | head -c 400
  ```
  Expected: `"status":"completed"` within ~60s of the first request (the first scan pays the
  container image pull). Record how long it took — it is the cold-start number the spec asks
  for.

- [ ] **Step 7: Run Task 9 Step 4 now** (set the two AI keys), then re-run one audit and
  confirm `ai.source` in the record is the live provider rather than the deterministic
  fallback.

---
### Task 11: The deploy workflow **[agent]**

**Files:**
- Create: `.github/workflows/aws-deploy.yml`

**Interfaces:**
- Consumes: `vars.AWS_ROLE_ARN` (Task 12), the bootstrap ECR repository (Task 2), the
  `infra/` outputs `frontend_bucket`, `distribution_id`, `base_url` (Task 8),
  `scripts/smoke-aws.sh` (Task 13).
- Produces: a keyless deploy on every push to `main`, gated on manual approval.

The step order is forced by dependencies, not preference (spec §7.2): the image must exist
before `apply` because the container functions reference the tag; the bucket must exist
before `s3 sync`; the invalidation needs the distribution id.

- [ ] **Step 1: Write the workflow**

  `.github/workflows/aws-deploy.yml`:

  ```yaml
  name: Deploy to AWS

  on:
    push:
      branches: [main]
      paths:
        - "src/**"
        - "lambda/**"
        - "infra/**"
        - "scripts/**"
        - "public/**"
        - "next.config.ts"
        - "package.json"
        - "package-lock.json"
        - "Dockerfile.lambda"
        - ".github/workflows/aws-deploy.yml"
    workflow_dispatch:

  # Two applies must never race. Queue rather than cancel: cancelling mid-apply
  # leaves the lock held and the state one resource behind reality.
  concurrency:
    group: aws-deploy
    cancel-in-progress: false

  permissions:
    contents: read

  env:
    AWS_REGION: us-east-1
    ECR_REPOSITORY: sitedoc-browser
    # The deployed Chromium comes from the container image, so neither job needs
    # Playwright's own browser download.
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"

  jobs:
    verify:
      name: Verify and build
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: "20"
            cache: npm
        - run: npm ci
        - run: npx eslint .
        - run: npm run typecheck
        - run: npm test
        - run: npm run build
        - run: npm run bundle:lambda
        - uses: actions/upload-artifact@v4
          with:
            name: build-output
            path: |
              out
              dist-lambda
            retention-days: 1
            include-hidden-files: true

    deploy:
      name: Deploy
      needs: verify
      runs-on: ubuntu-latest
      # The approval gate. It is also what the OIDC trust policy pins `sub` to,
      # so removing it does not just skip the prompt — it breaks the role.
      environment: production
      permissions:
        contents: read
        id-token: write
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: "20"
            cache: npm
        # The image copies playwright, playwright-core and axe-core out of
        # node_modules, so the Docker build context needs a real install.
        - run: npm ci
        - uses: actions/download-artifact@v4
          with:
            name: build-output

        - uses: aws-actions/configure-aws-credentials@v4
          with:
            role-to-assume: ${{ vars.AWS_ROLE_ARN }}
            aws-region: ${{ env.AWS_REGION }}
            role-session-name: sitedoc-deploy-${{ github.run_id }}
        - id: ecr
          uses: aws-actions/amazon-ecr-login@v2

        - name: Build and push the browser image
          env:
            REGISTRY: ${{ steps.ecr.outputs.registry }}
          run: |
            # The repository is IMMUTABLE, so a re-run of a failed deploy would
            # fail on push. Skipping is also correct: the tag is the commit, so
            # an existing image is already the right one.
            if aws ecr describe-images --repository-name "$ECR_REPOSITORY" \
                 --image-ids imageTag="$GITHUB_SHA" >/dev/null 2>&1; then
              echo "Image for $GITHUB_SHA already in ECR — reusing it."
              exit 0
            fi
            IMAGE="$REGISTRY/$ECR_REPOSITORY:$GITHUB_SHA"
            docker build -f Dockerfile.lambda -t "$IMAGE" .
            docker push "$IMAGE"

        - uses: hashicorp/setup-terraform@v3
          with:
            terraform_version: 1.11.4
            # `terraform output -raw` must not be wrapped in the action's
            # stdout/stderr decoration; later steps parse it.
            terraform_wrapper: false

        - name: Terraform apply
          working-directory: infra
          run: |
            ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
            terraform init -backend-config="bucket=sitedoc-tfstate-$ACCOUNT"
            terraform apply -auto-approve -var="image_tag=$GITHUB_SHA"

        - name: Publish the static export
          working-directory: infra
          run: |
            aws s3 sync ../out "s3://$(terraform output -raw frontend_bucket)" --delete

        - name: Invalidate the CloudFront cache
          working-directory: infra
          run: |
            aws cloudfront create-invalidation \
              --distribution-id "$(terraform output -raw distribution_id)" \
              --paths "/*"

        - name: Smoke test the deployment
          working-directory: infra
          run: ../scripts/smoke-aws.sh "$(terraform output -raw base_url)"
  ```

  Four things worth not "simplifying" later:

  - `npm ci` runs in **both** jobs. The build artifact carries `out/` and `dist-lambda/`,
    but the Docker build needs `node_modules/{playwright,playwright-core,axe-core}` in the
    context (see `Dockerfile.lambda`), and artifacts are the wrong transport for 300 MB of
    packages.
  - `id-token: write` is on the `deploy` job only. Granting it workflow-wide would let the
    `verify` job — which runs before any approval — mint AWS tokens.
  - `vars.AWS_ROLE_ARN`, not `secrets.*`: a role ARN is not a secret, and masking it makes
    OIDC failures much harder to read.
  - The image is rebuilt on every deploy even when only the frontend changed, because the
    tag is the commit SHA. That costs ~4 minutes and is the accepted price of "the running
    image is always the committed Dockerfile". If it becomes painful, add
    `docker/build-push-action` with `cache-from: type=registry` — do not switch to a mutable
    tag like `latest`, which would make `terraform apply` a no-op and silently leave the old
    image running.

- [ ] **Step 2: Lint it**

  The release assets carry the version in their filename, so `latest/download/` does not
  resolve to one:

  ```bash
  V=$(curl -sS https://api.github.com/repos/rhysd/actionlint/releases/latest | jq -r .tag_name | tr -d v)
  curl -sSL "https://github.com/rhysd/actionlint/releases/download/v$V/actionlint_${V}_linux_amd64.tar.gz" \
    | tar xz -C /tmp actionlint
  /tmp/actionlint .github/workflows/aws-deploy.yml .github/workflows/ci.yml
  ```
  Expected: no output.

  `shellcheck` warnings about `$GITHUB_SHA` are false positives here — it is a runner
  environment variable, not an interpolation.

- [ ] **Step 3: Commit**

  ```bash
  git add .github/workflows/aws-deploy.yml
  git commit -m "ci: deploy to AWS from GitHub Actions with OIDC"
  ```

---

### Task 12: GitHub environment and role variable **[maintainer]**

Two settings in the repository. Without them the workflow fails at
`configure-aws-credentials` with `Could not load credentials from any providers`.

- [ ] **Step 1: Create the `production` environment**

  Settings → Environments → **New environment** → name it exactly `production` (the OIDC
  `sub` condition is `repo:kyle41io/SiteDoc-AI:environment:production`; a different name
  means every deploy is denied by the trust policy).

  Add **Required reviewers** → yourself. That is the approval gate; without a reviewer the
  environment adds nothing.

  Optionally restrict deployment branches to `main`.

- [ ] **Step 2: Add the role ARN as an environment variable**

  In the same environment, under **Environment variables**, add:

  | Name | Value |
  |---|---|
  | `AWS_ROLE_ARN` | the `deploy_role_arn` output from Task 9 Step 3 |

  A **variable**, not a secret.

- [ ] **Step 3: Confirm the trust relationship reads as expected**

  ```bash
  aws iam get-role --role-name sitedoc-deploy \
    --query 'Role.AssumeRolePolicyDocument' --profile sitedoc-bootstrap
  ```
  Expected: `token.actions.githubusercontent.com:sub` equal to
  `repo:kyle41io/SiteDoc-AI:environment:production` and `:aud` equal to
  `sts.amazonaws.com`. If `sub` is a branch form, fix Task 2 and re-apply — a branch-pinned
  role can be assumed by any workflow on that branch, approval or not.

---

### Task 13: Smoke test script **[agent]**

**Files:**
- Create: `scripts/smoke-aws.sh`
- Modify: `package.json` (add `smoke:aws`)

**Interfaces:**
- Consumes: a deployed base URL (argument or `SITEDOC_BASE_URL`).
- Produces: a non-zero exit on any parity failure; run by Task 11's last step and by hand
  during cutover.

This covers the machine-checkable half of the spec §8 parity table. The half that needs eyes
(five locales, theme toggle, screenshots actually looking right) is Task 15.

- [ ] **Step 1: Write the script**

  `scripts/smoke-aws.sh`:

  ```bash
  #!/usr/bin/env bash
  # Deployment smoke test: drives one real audit through a deployed base URL and
  # checks the behaviors from spec §8 that are verifiable from outside the app.
  # Usage: scripts/smoke-aws.sh https://dxxxxxxxx.cloudfront.net
  set -euo pipefail

  BASE="${1:-${SITEDOC_BASE_URL:-}}"
  if [ -z "$BASE" ]; then
    echo "usage: scripts/smoke-aws.sh <base-url>" >&2
    exit 2
  fi
  BASE="${BASE%/}"
  TARGET="${SMOKE_TARGET_URL:-https://example.com}"
  TIMEOUT_S="${SMOKE_TIMEOUT_S:-240}"

  command -v jq >/dev/null || { echo "smoke test needs jq" >&2; exit 2; }

  fail() { echo "FAIL: $*" >&2; exit 1; }
  ok()   { echo "  ok — $*"; }

  code_of() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }

  echo "Smoke testing $BASE"

  # 1. The page path is pure S3 — no compute, no cold start.
  [ "$(code_of "$BASE/")" = 200 ] || fail "GET / did not return 200"
  ok "home page served"

  # 2. An unknown path is a 404, not the SPA shell. This is also the check that
  #    the /report rewrite has not swallowed everything.
  [ "$(code_of "$BASE/definitely-not-a-page")" = 404 ] || fail "unknown path did not 404"
  ok "unknown path 404s"

  # 3. The SSRF guard runs before anything is queued (spec §5.6).
  guard=$(code_of -X POST "$BASE/api/audits" -H 'content-type: application/json' \
    -d '{"url":"http://127.0.0.1/","language":"en"}')
  [ "$guard" = 400 ] || fail "SSRF guard returned $guard, expected 400"
  ok "SSRF guard rejects loopback"

  # 4. Create a real audit. 202 + a queued record, exactly as on Render.
  started=$SECONDS
  created=$(curl -sS -X POST "$BASE/api/audits" -H 'content-type: application/json' \
    -d "$(jq -nc --arg url "$TARGET" '{url: $url, language: "en"}')")
  id=$(jq -r '.id // empty' <<<"$created")
  [ -n "$id" ] || fail "POST /api/audits returned no id: $created"
  [ "$(jq -r .status <<<"$created")" = queued ] || fail "new audit was not queued: $created"
  ok "audit $id queued"

  # 5. Poll to completion. The first run pays the container image pull, which is
  #    the cold-start number spec §11.5 asks for.
  while :; do
    record=$(curl -sS "$BASE/api/audits?id=$id")
    status=$(jq -r '.status // "?"' <<<"$record")
    case "$status" in
      completed) break ;;
      failed) fail "audit failed: $(jq -r '.error // .summary // ""' <<<"$record")" ;;
      queued|running) ;;
      *) fail "unexpected status '$status': $(head -c 200 <<<"$record")" ;;
    esac
    [ $((SECONDS - started)) -lt "$TIMEOUT_S" ] \
      || fail "audit still '$status' after ${TIMEOUT_S}s"
    sleep 5
  done
  elapsed=$((SECONDS - started))
  ok "audit completed in ${elapsed}s"

  # 6. Scores and localized summary survived the store round-trip.
  jq -e '.scores.overall | numbers' >/dev/null <<<"$record" || fail "no overall score"
  jq -e '.summary | strings | length > 0' >/dev/null <<<"$record" || fail "no summary"
  ok "scored $(jq -r .scores.overall <<<"$record")/100"

  # 7. Both screenshots are reachable at the public /artifacts/ URL shape.
  for viewport in desktop mobile; do
    path=$(jq -r --arg v "$viewport" '.screenshots[$v] // empty' <<<"$record")
    [ -n "$path" ] || fail "no $viewport screenshot on the record"
    headers=$(curl -sS -o /dev/null -D - "$BASE$path")
    grep -qi '^HTTP/[0-9.]* 200' <<<"$headers" || fail "$viewport screenshot not 200"
    grep -qi 'content-type: image/png' <<<"$headers" || fail "$viewport is not a PNG"
    ok "$viewport screenshot cached at $path"
  done

  # 8. The shareable link keeps its URL through the edge rewrite.
  [ "$(code_of "$BASE/report/$id")" = 200 ] || fail "/report/$id did not return 200"
  ok "report page served at its own URL"

  # 9. The PDF is a real PDF, rendered by the container function.
  pdf=$(mktemp); trap 'rm -f "$pdf"' EXIT
  pdf_code=$(curl -sS -o "$pdf" -w '%{http_code}' "$BASE/pdf/$id")
  [ "$pdf_code" = 200 ] || fail "GET /pdf/$id returned $pdf_code"
  [ "$(head -c 4 "$pdf")" = "%PDF" ] || fail "/pdf/$id did not return a PDF"
  ok "PDF downloaded ($(wc -c <"$pdf") bytes)"

  # 10. A missing audit is a 404 from the API, not a 500.
  [ "$(code_of "$BASE/api/audits?id=00000000-0000-4000-8000-000000000000")" = 404 ] \
    || fail "unknown audit id did not 404"
  ok "unknown audit id 404s"

  echo
  echo "PASS — audit $id completed in ${elapsed}s"
  echo "Record: $BASE/report/$id"
  ```

- [ ] **Step 2: Make it executable and add the script alias**

  ```bash
  chmod +x scripts/smoke-aws.sh
  ```

  In `package.json` `scripts`, after `test:e2e`:

  ```json
  "smoke:aws": "scripts/smoke-aws.sh"
  ```

- [ ] **Step 3: Prove it fails cleanly**

  ```bash
  bash -n scripts/smoke-aws.sh                     # syntax
  ./scripts/smoke-aws.sh 2>&1; echo "exit=$?"      # usage
  ./scripts/smoke-aws.sh http://127.0.0.1:1 2>&1 | tail -2
  ```
  Expected: `exit=2` for no argument; a `FAIL: GET / did not return 200` for an unreachable
  base. Also run `shellcheck scripts/smoke-aws.sh` if available; warnings about `$SECONDS`
  arithmetic are expected and fine.

- [ ] **Step 4: Prove it passes, before any AWS exists**

  `npm run serve:local` implements the same routing table CloudFront will, so the whole
  script can be exercised locally against a real scan:

  ```bash
  npm run build
  npm run serve:local &                       # port 3000
  SMOKE_TIMEOUT_S=150 ./scripts/smoke-aws.sh http://localhost:3000
  kill %1
  ```
  Expected: every check `ok` and `PASS`. This is what makes a failure against the deployed
  URL in Task 14 meaningful — it points at the infrastructure rather than at the script.

  The one behavior it cannot cover locally is the `/artifacts/` → `/audits/` key rewrite,
  which only exists in the CloudFront Function; locally the artifact store serves that path
  directly.

- [ ] **Step 5: Commit**

  ```bash
  git add scripts/smoke-aws.sh package.json
  git commit -m "test(deploy): add an AWS deployment smoke test"
  ```

---

### Task 14: First pipeline deploy **[maintainer]**

Task 10 deployed by hand. This proves the pipeline can do it keylessly.

- [ ] **Step 1: Merge and watch the run**

  Merge the infrastructure PR into `main`. The `verify` job runs, then `deploy` waits for
  approval.

  ```bash
  gh run list --workflow aws-deploy.yml --limit 1
  ```

- [ ] **Step 2: Approve, then read the credential step carefully**

  Approve the `production` deployment. The first thing to check is the
  `configure-aws-credentials` step:

  - `Not authorized to perform sts:AssumeRoleWithWebIdentity` → the `sub` condition does not
    match. Compare it against the run's actual claim; the environment name is the usual
    culprit (Task 12 Step 1).
  - `Could not load credentials from any providers` → `vars.AWS_ROLE_ARN` is unset, or was
    added as a repository variable instead of an environment variable.

- [ ] **Step 3: Confirm the run is a no-op for infrastructure but a real image push**

  Expected in the apply log: `2 to change` (the two container functions picking up the new
  tag) and no destroys. If the plan wants to *replace* the distribution or either bucket,
  **cancel the run** — something in `infra/` drifted from what Task 10 applied, and finding
  out why is cheaper than a new distribution and a lost bucket.

- [ ] **Step 4: The smoke test must pass in CI**

  The final step runs `scripts/smoke-aws.sh` against `base_url`. Expected: `PASS — audit …`.
  Record the reported completion time; compare it with Task 10 Step 6 (this one should be
  warm and much faster).

- [ ] **Step 5: Prove the gate is load-bearing**

  Push a trivial commit to a branch and open a PR. Expected: `ci.yml` runs; `aws-deploy.yml`
  does **not**. Nothing deploys without a merge plus an approval.

---

### Task 15: Behavior parity verification **[maintainer]**

The spec's definition of done requires the §8 table verified item by item, not just the
machine-checkable subset. Do this in a browser against the CloudFront URL, with Render still
running so anything surprising can be compared side by side.

- [ ] **Step 1: Run the automated half**

  ```bash
  npm run smoke:aws -- "$BASE"
  ```
  Expected: `PASS`. That covers rows 1, 3, 7, 8 and 9 of the parity table.

- [ ] **Step 2: Walk the table in a browser**

  | Parity row | Check | Pass condition |
  |---|---|---|
  | Screenshots | Open a completed report | Desktop and mobile images both render, not broken icons |
  | Analyzer output | Compare one report with the same URL audited on Render | Same overall score ±0, same issue count |
  | AI enrichment | `curl -s "$BASE/api/audits?id=$ID" \| jq .ai.source` | `"ai"`, not `"fallback"` (needs Task 9 Step 4 done) |
  | 5 locales | Switch language, run an audit in each of en/vi/es/zh/ja | UI and audit summary both in that language |
  | Report language | Open a `vi` report with the switcher set to `en` | Report stays Vietnamese |
  | Hard reload | Reload `/report/{id}` twice, then open it in a private window | 200 and full content both times — the rewrite is not a client-side-only route |
  | PDF | Download from the report page | A4, backgrounds present, screenshots included, URL fitted |
  | PDF concurrency | Trigger 4 PDF downloads at once | All succeed or return `503` + `Retry-After`; none times out |
  | Failed audit | Audit `https://this-host-does-not-exist.example` | A `failed` record with a localized summary, not a hung `running` |
  | Theme + hero | Toggle light/dark; reload | No flash of the wrong theme; hero identical across locales |
  | 404 panel | Open `/report/00000000-0000-4000-8000-000000000000` | The localized not-found panel |
  | Durability | Re-open a report created before the last deploy | Still there — the row Render could not satisfy |

  Any mismatch is a bug in this migration, not an acceptable difference. Stop and fix it
  before Task 16; that is what leaving Render running is for.

- [ ] **Step 3: Record the two numbers the spec asks for**

  ```bash
  # Cold scan: after >15 min of idle, so the scan worker is not warm.
  time npm run smoke:aws -- "$BASE"

  # Warm page load, five samples.
  for _ in 1 2 3 4 5; do
    curl -sS -o /dev/null -w '%{time_total}s %{http_code}\n' "$BASE/"
  done
  ```

  Write both into the PR description with the image size (`docker images sitedoc-browser`).
  Spec §11.5 sets the bar: if the cold first scan is dominated by the image pull, note it and
  open a follow-up to slim the image — do not slim it inside this plan.

- [ ] **Step 4: Confirm the DLQ is empty and the logs are clean**

  ```bash
  aws sqs get-queue-attributes --queue-url "$(cd infra && terraform output -raw queue_url)-dlq" \
    --attribute-names ApproximateNumberOfMessages
  aws logs tail /aws/lambda/sitedoc-scan --since 30m --format short | grep -i error || echo "clean"
  ```
  Expected: `0` messages and no errors. A non-empty DLQ means scans are failing and being
  retried out of sight.

---

### Task 16: Documentation and Render removal **[agent]**

Only after Task 15 passes. Until this task lands, rollback is "keep using the Render URL",
which is why it is last (spec §9).

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Delete: `render.yaml`
- Delete: `Dockerfile`

- [ ] **Step 1: Confirm the Render artifacts are genuinely unreferenced**

  ```bash
  grep -rn "render.yaml\|render\.com\|next start" --include='*.ts' --include='*.tsx' \
    --include='*.json' --include='*.yml' --include='*.md' . \
    | grep -v node_modules | grep -v docs/superpowers
  ```
  Expected: only the README/AGENTS lines this task rewrites. A hit in `.github/workflows/`
  or `package.json` means something still depends on the container deploy — resolve that
  first.

  Also confirm nothing else uses the root `Dockerfile`:

  ```bash
  grep -rn "Dockerfile" --include='*.yml' --include='*.md' --include='*.json' . \
    | grep -v node_modules | grep -v "Dockerfile.lambda"
  ```
  The README's Hugging Face front-matter (`sdk: docker`) is a separate concern — it points at
  the root `Dockerfile`, so either keep the Space's build working another way or drop the
  front-matter in the same commit. Decide explicitly rather than leaving a Space that builds
  nothing.

- [ ] **Step 2: Rewrite the README deployment section**

  Replace the "Terraform, the OIDC deploy workflow and the Render decommission are the next
  phase…" paragraph with what actually exists:

  ```markdown
  Infrastructure is Terraform in `infra/` (applied by CI) and `infra/bootstrap/` (applied
  once by hand: state bucket, GitHub OIDC provider, deploy role, ECR repository).
  `.github/workflows/aws-deploy.yml` deploys on merge to `main` — verify, then a manual
  approval on the `production` environment, then OIDC into AWS, push the browser image to
  ECR, `terraform apply`, sync `out/` to S3, invalidate CloudFront, and run
  `scripts/smoke-aws.sh` against the live URL. There are no long-lived AWS credentials in
  GitHub. Secrets live in SSM Parameter Store and are set with `aws ssm put-parameter`;
  Terraform manages the parameters but never their values.

  Deploying by hand requires Terraform 1.11+, AWS CLI v2 and Docker.
  ```

  Also update: the "Shareable Reports & PDF Export" claim that the server renders over the
  internal loopback (it navigates CloudFront now), and the Roadmap "Upcoming" entry — the
  AWS migration is shipped, so move it to "Shipped".

- [ ] **Step 3: Update `AGENTS.md`**

  In Technical Defaults, replace the deployment-target bullet's forward-looking wording with
  the deployed reality, and add:

  ```markdown
  - Infrastructure: Terraform, `infra/` + `infra/bootstrap/`. No AWS resource is created by
    hand. Secrets are SSM parameters whose values Terraform never sees. Deploys run from
    `.github/workflows/aws-deploy.yml` via GitHub OIDC behind a manual approval on the
    `production` environment.
  ```

- [ ] **Step 4: Delete the Render deploy artifacts**

  ```bash
  git rm render.yaml Dockerfile
  ```

  Neither has described this app since the static export landed (`next start` no longer
  exists), so this deletes something already broken rather than a working fallback.

- [ ] **Step 5: Verify**

  ```bash
  ./node_modules/.bin/eslint . && npm run typecheck && npm test && npm run build
  ```
  Expected: all green. Nothing here touches app code, so a failure means Step 4 removed
  something that was still wired in.

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "docs: document the AWS deployment and remove the Render blueprint"
  ```

---

### Task 17: Decommission Render **[maintainer]**

- [ ] **Step 1: Confirm AWS has been serving correctly for at least a day**

  ```bash
  npm run smoke:aws -- "$BASE"
  ```
  Plus one report created before the previous deploy, still loading. Durability is the whole
  point of the move.

- [ ] **Step 2: Suspend before deleting**

  In the Render dashboard, **suspend** the service and leave it a day. Suspending is
  reversible; deleting is not. If nothing breaks and nobody notices, delete the service.

- [ ] **Step 3: Note what remains of the old deploy**

  The Hugging Face Space (if kept) and any DNS or links pointing at the Render URL. Update
  the links; a dead Render URL in a CV portfolio is worse than a slow one.

- [ ] **Step 4: Close the loop on the compromised key**

  ```bash
  aws iam list-access-keys --user-name <bootstrap-user>
  ```
  Expected: the compromised key is gone, and the temporary bootstrap key is gone too. If
  either is still listed, delete it now. Every deploy from here is keyless.

---

## Self-Review

Run this before declaring the plan complete.

- [ ] **Every AWS resource is in Terraform.** `aws resourcegroupstaggingapi get-resources
      --tag-filters Key=Project,Values=sitedoc-ai` lists nothing that `terraform state list`
      does not.
- [ ] **No secret in state.** `terraform show -json | grep -ci "sk-ant\|sk-proj\|AKIA"`
      returns `0`. Also confirm `git log -p --all | grep -c "AKIA"` is `0`.
- [ ] **No AWS credential in GitHub.** Settings → Secrets: no `AWS_ACCESS_KEY_ID`. The only
      AWS-related entry is the `AWS_ROLE_ARN` *variable*.
- [ ] **The approval gate cannot be bypassed.** The trust policy's `sub` is the environment
      form, and the `production` environment has a required reviewer.
- [ ] **Both bucket policies condition on `AWS:SourceArn`** for this distribution only.
- [ ] **Retention is set everywhere it was promised:** DynamoDB TTL 30 days, artifacts
      lifecycle 30 days, all three log groups 14 days.
- [ ] **`AWS_REGION` is not a user environment variable** on any function:
      `terraform show -json | grep -c '"AWS_REGION"'` is `0`.
- [ ] **The spec's five open verifications are answered in writing** (§11): OAC with `POST`
      bodies, RIC on the Playwright base, static export + `next/font`, the rewrite coexisting
      with the 403 → `/404.html` mapping, and the measured cold start. Record which OAC path
      was taken.
- [ ] **The §8 parity table is verified row by row** (Task 15), not assumed.
- [ ] **App verification gate passes:** `./node_modules/.bin/eslint .`, `npm run typecheck`,
      `npm test`, `npm run build`, and `npm run test:e2e` against the local export.
- [ ] **Infrastructure verification passes:** `terraform fmt -check -recursive`,
      `terraform validate` in both stacks, `actionlint`.
- [ ] **A code-review pass has been run** over the whole change (`code-reviewer` subagent or
      equivalent).
- [ ] **Docs match reality.** `README.md` and `AGENTS.md` describe the AWS architecture, and
      no file still describes deploying to Render.
- [ ] **Cost is what the spec claimed.** Cost Explorer for the first full day shows nothing
      unexpected — a NAT gateway or a provisioned-capacity table would show up immediately.
      Consider a $1 billing alarm even though the spec lists it as an accepted gap.

---

## Handoff summary

What an agent can finish alone: Tasks 1–8, 11, 13, 16 — all of `infra/`, the workflow, the
smoke test and the docs, validated locally with no AWS access.

What needs the maintainer: Tasks 9, 10, 12, 14, 15, 17 — the bootstrap apply, the first
apply and the OAC verification, the GitHub environment, the first pipeline run, the parity
walkthrough, and the Render shutdown.

The natural stopping point is the end of Task 8 plus Tasks 11 and 13 (which need nothing
from AWS): everything is written, validated and committed, waiting on one temporary
credential to go live.


