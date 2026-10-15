# AGENTS.md: Geneie newprod engineering standard

<!-- CORE START: this part is identical in praveen-roy/bio-lab-project, praveen-roy/advanced-chat-sidecar and
Geneie-ai-Org/geneie-frontend. Change it in all three repos in the same week. The repo-specific part is at the end. -->

This file tells any engineer or coding agent how to build on Geneie **newprod** at the same architecture and quality
bar as the rest of the system. Default to the simplest design that meets the answers to section 2. Add complexity
only when an answer requires it.

Repo shorthand used below (paths are relative to that repo's root):

| Tag | Repo | Newprod branch (PR base) |
|---|---|---|
| `BE:` | `praveen-roy/bio-lab-project` (backend API, workers, all Terraform) | `feat/newprod-baseline` |
| `SC:` | `praveen-roy/advanced-chat-sidecar` (advanced-chat sidecar, Explore agents, corpus jobs) | `newprod` |
| `FE:` | `Geneie-ai-Org/geneie-frontend` (React/Vite app on Vercel) | `newprod` |

## 0. How a coding agent works here

1. Read this file and the repo section at the end.
2. Before writing code for a new feature, endpoint, job, flag, table, queue or service: run **section 2 (ASK
   BEFORE BUILDING)**, wait for the human's answers, and copy the answers into the PR description.
3. Pick an existing pattern from section 3. New infrastructure needs a written reason in the PR.
4. Keep changes small: one topic per PR. Tests and docs go in the same PR as the code.
5. End with the PR checklist (section 9), pasted into the PR description and filled in.

## 1. Environments and branches

- **Newprod** = AWS `ap-south-1`, ECS cluster `geneie-newprod`, resources named `geneie-newprod-*`, API
  `https://api-newprod.geneie.chat`. **Old prod** = the `biochat-*` resources. Old prod is off-limits:
  `BE:deploy/terraform/scripts/plan_guard.sh` blocks any plan that adds or changes it.
- `main` is **old prod** in all three repos. Never push to `main`, never open a PR into `main`, never merge into it.
  `SC:` `main` deploys the old prod box (`SC:.github/workflows/deploy-prod.yml`). `FE:` `dev` is also not newprod.

| Repo | Merge to the newprod branch does |
|---|---|
| `BE:` | `BE:.github/workflows/newprod-ci.yml`: tests, image, ECS task definitions, rolling deploy of `backend-prod`, `backend-worker`, `pgx-worker`, worker boot code to S3, Module 1 control plane. `BE:.github/workflows/terraform-newprod.yml`: Terraform apply. |
| `SC:` | `SC:.github/workflows/deploy-newprod-sidecar-ecs.yml` (sidecar + corpus-jobs task def), `SC:.github/workflows/deploy-newprod-exploratory.yml` (Explore service) |
| `FE:` | Vercel builds and deploys the newprod frontend from `newprod` |

Branch and merge rules:
- Branch from `origin/<newprod branch>`. Squash-merge. Delete the branch after merge.
- CI must be green before merge. Read each check's **conclusion**; "finished" is not "passed".
- Workflows are path-filtered. If your PR changes code and no workflow ran, find out why before merging.
- Two PRs that are each green can still break the base together. If the base moved since your last CI run:
  `gh pr update-branch <number>`, wait for CI to re-run green, then merge. Merge PRs that touch the same files or
  tests one at a time.
- After merge, watch the deploy run to the end (`services-stable`, the `/ready` health check, the apply result).

## 2. ASK BEFORE BUILDING

Before writing code, ask the human these questions and **wait for answers**. Do not guess. If the answer is "don't
know", propose the simplest option, say it is an assumption, and get a yes.

**2.1 Scalability**
- Expected users and jobs per hour? Peak burst (for example, how many uploads in one minute)?
- Largest input: file size in bytes, rows or variants? (Existing caps live in `BE:biochat-backend/main.py`
  `*_MAX_FILE_SIZE_MB` / `PRO_MAX_*` and `BE:biochat-backend/module1_api.py` `MODULE1_MAX_FASTQ_BYTES`.)
- Must it run when nobody is using it? What may scale to zero (queue workers) and what must stay up (API)?
- Per-user limits? Concurrency must be per user or per job, never one global slot.

**2.2 Hot-tunability and flexibility**
- What must change **without a deploy**? Pick the lever:

| Lever | Change time | Use for |
|---|---|---|
| Config-store key (`PUT /api/admin/config/<key>`) | seconds, audited | flags, kill switches, thresholds, prompts, canary lists |
| SSM parameter `/geneie/newprod/...` (set by hand) | seconds | worker capacity floors, schedules, worker gates read at runtime |
| Task-definition env (`BE:deploy/ecs/*.json`) | PR + deploy | process wiring: queue URLs, hosts, feature env |
| Terraform | PR + apply | infrastructure, ceilings, IAM |

- Is there a kill switch? Its name and safe default? The safe default is today's behaviour.
- Who flips it, and how is it undone?

**2.3 Data plane**
- Where does the data come from, and where does it go? Which store: app Postgres, sidecar Postgres (pgvector),
  DocumentDB/Mongo, Redis, S3 prefix in `geneie-newprod-variant-files`, DynamoDB?
- What is the source of truth, and what is only a cache? How is the cache invalidated, and what is its TTL?
- Is it versioned (a release key such as `dataplane.annotation.release.hg38`)? How are old versions read?
- Retention: how long is it kept, which lifecycle rule applies, what is purged on delete or unlock?
- Does it replace an existing path? Then it ships behind a flag with shadow and parity first (section 6).

**2.4 Latency and speed**
- Does a user wait on it (synchronous) or is it background (job + poll)? Target seconds for each.
- Acceptable cold start? A scaled-to-zero worker takes minutes, not seconds, to start.
- Timeout at every hop (browser, ALB, API, upstream service)?

**2.5 Information security (always ask; never skip)**
- Who may read the input and the result: the owner only, admins? How is ownership checked on every endpoint?
- Least privilege: exactly which AWS actions and which resource ARNs or S3 prefixes does the code need?
- Secrets: which keys, in which secret, who sets the values?
- Can genetic data or PHI (variants, genotypes, phenotypes, HPO terms, names, file contents) reach logs, metrics,
  error text, notifications, emails or analytics? It must not.
- Presigned URLs: method, exact key prefix, TTL (existing default is 3600 s; do not go higher).
- Retention and purge: when is it deleted? What happens on chat delete or unlock?
- Admin-only fields: raw errors, S3 keys, hostnames, stack traces. Non-admins must never receive them.
- Input validation: size, type, allow-lists, S3 key and path traversal, SQL identifiers.
- Blast radius: if this is wrong or compromised, what else breaks or leaks? Can it be switched off alone?

## 3. Reuse before you build (no over-engineering)

Use an existing pattern first. A new service, queue, datastore, Lambda, bucket or framework needs a written reason
in the PR: which answer from section 2 the existing pattern cannot meet.

| Need | Existing pattern | Reference |
|---|---|---|
| Work longer than a request (seconds or more) | new job type on the `backend-worker` queue | `BE:biochat-backend/backend_jobs.py`, `BE:biochat-backend/backend_job_worker.py` |
| Heavy isolated worker with its own scaling | ECS worker service like PGx | `BE:deploy/terraform/newprod/pgx_worker.tf`, `BE:deploy/ecs/pgx-worker-task-definition.json` |
| Flag, threshold, kill switch, prompt | config store | `BE:biochat-backend/config_admin.py`, `BE:biochat-backend/seed_config.py`, `SC:config_store.py` |
| Scheduled batch | EventBridge rule -> ECS RunTask | `BE:deploy/terraform/newprod/corpus_jobs.tf` |
| Job status in the UI | poll endpoint with `terminal` + `failure` | `BE:biochat-backend/module1_api.py`, `FE:src/lib/module1PipelinePhases.js` |
| Async failure record | `failure_record()` | `BE:biochat-backend/job_lifecycle.py` |
| Replace a pipeline | routing flags + shadow parity | `BE:biochat-backend/dataplane_routing.py`, `BE:biochat-backend/annotation_parity.py` |
| Scale workers to zero | scale-in Lambda | `BE:deploy/lambda/worker_scale_in/handler.py`, `BE:deploy/terraform/newprod/worker_scaling.tf` |
| Change capacity right now | infra admin API | `BE:biochat-backend/infra_admin.py` |
| Change secret keys | merge tool | `BE:deploy/secrets/set_secret_keys.py` |
| End-to-end check | e2e replay harness | `BE:deploy/e2e_replay/run.py` |

Do not: add a new framework, ORM, broker, cache layer or datastore; add an abstraction with one caller; make
something configurable that nobody asked to tune; copy a pattern listed under "Known exceptions" in a repo section.

## 4. Newprod service standard (checklist for any new service or worker)

Reference implementation: the PGx worker (`BE:deploy/terraform/newprod/pgx_worker.tf`, its service in
`BE:deploy/terraform/newprod/ecs_services.tf`, `BE:deploy/ecs/pgx-worker-task-definition.json`).

- [ ] **Own task role and own execution role** (`geneie-newprod-<svc>-ecs-task`, `geneie-newprod-<svc>-ecs-execution`).
      Task role = only the calls the code makes, on exact ARNs/prefixes. Execution role = ECR pull, its own log
      group, its own secret.
- [ ] **Own secret** (`geneie-newprod-<svc>-runtime`) holding only the keys it reads. IAM cannot limit access to
      some keys inside a JSON secret, so a shared secret shares every key.
- [ ] **Own log group** `/ecs/geneie-newprod-<svc>` with `retention_in_days` (30 is the standard).
- [ ] **Own security group**: no ingress unless it serves traffic (then only from the ALB SG); egress only what it
      needs. Allow it into a datastore by adding it to that datastore SG's **inline `ingress` list** in
      `BE:deploy/terraform/newprod/newprod_security.tf`. Do not add `aws_security_group_rule` resources: they fight
      the inline lists.
- [ ] **Service shell** in `ecs_services.tf` (copy the `pgx_worker` block): a `deployment_circuit_breaker` block with
      `enable = true` and `rollback = true`, `enable_execute_command = false`, and
      `lifecycle { ignore_changes = [task_definition, desired_count] }`.
- [ ] **Container hardening**: non-root (`USER app` in the Dockerfile), `linuxParameters` with
      `capabilities.drop ["ALL"]` and `initProcessEnabled: true`, `readonlyRootFilesystem: true` where the code
      can write only to a mounted temp volume, `stopTimeout: 120`.
- [ ] **Scaling**: queue workers get an entry in `local.scalable_ecs_workers` (`worker_scaling.tf`; the Lambda reads
      it as `ECS_WORKERS`; EC2 worker groups use `WORKERS`). Web services use target tracking on
      `ECSServiceAverageCPUUtilization` and/or `ALBRequestCountPerTarget` (`BE:deploy/terraform/newprod/autoscaling.tf`).
- [ ] **Health**: a web service exposes `/ready` and uses it for the ALB and container health checks.
- [ ] **Alarms** to SNS `geneie-newprod-alerts`: queue backlog and DLQ not empty (`BE:deploy/terraform/newprod/alarms.tf`).
- [ ] **Deploy role can pass the new roles** (section 5.5) before the task-definition PR merges.
- [ ] **Docs**: secret key names in `BE:deploy/secrets/README.md`; new flags and queues described in the PR.

**Queue rules**
- Every queue has a DLQ (`redrive_policy` with `maxReceiveCount`; 3 to 5 in use).
- Visibility timeout >= the longest job runtime, **or** a short visibility plus a heartbeat that extends it
  (`BE:biochat-backend/annovar_sqs.py` `_run_with_visibility_heartbeat`).
- Fargate gives a task at most 120 s after SIGTERM. A job that can run longer must be resumable: on SIGTERM it
  stops, saves progress if it can, and releases its message (visibility 0) so another task picks it up.
- Alarm on backlog/age and on DLQ not empty.
- Handlers are idempotent (SQS delivers at least once): atomic claim on a job id, bill once per run, delete the
  message only on a terminal outcome.
- Message bodies carry ids, not data. Never log a message body.

**Graceful shutdown**
- A signal handler only sets a flag or `threading.Event`. No `print`, logging or other I/O inside it
  (`BE:biochat-backend/backend_jobs.py` `_on_signal`).
- On stop: no new receives; finish the in-flight job inside the stop timeout or release it; exit 0.
- Keep the long poll short (`BACKEND_JOB_WAIT_SEC`, default 5) so a stop is noticed quickly.
- **No long work in API threads.** API tasks are replaced on every deploy and scale-in, and a daemon thread dies
  with its task. Long work is a job type on `backend-worker`.

## 5. Terraform and deploy methodology (end to end)

### 5.1 Who owns what

| Thing | Owner | Where | How it changes |
|---|---|---|---|
| VPC, IAM, SGs, queues, data stores, ASGs, alarms, Lambdas, ECS service shells, variant-bucket lifecycle + CORS | Terraform | `BE:deploy/terraform/newprod/` | PR -> plan comment -> merge -> CI apply |
| Task defs `backend-prod`, `backend-worker`, `pgx-worker` | backend CI | `BE:deploy/ecs/*-task-definition.json` | edit JSON in a PR; CI registers + rolls |
| Task defs sidecar, exploratory, corpus-jobs | sidecar CI | `SC:deploy/ecs/` | PR to `SC:` `newprod` |
| Secret values | a person with access, via script | `BE:deploy/secrets/set_secret_keys.py` | out of band, never in git |
| SSM parameters | a person, by hand (or the infra admin API for capacity) | `/geneie/newprod/...` | `aws ssm put-parameter` |
| Config-store flags | admin API | `PUT /api/admin/config/<key>` | runtime |
| Worker boot code | backend CI -> S3 `exomiser-worker/` | `newprod-ci.yml` | merge |
| Worker AMIs | Image Builder (started by hand) | `BE:deploy/worker-ami/README.md` | PR changing `image_id` |
| Module 1 control plane (head box) | backend CI -> S3 `module1/control-plane/current/` | `newprod-ci.yml` | merge |
| Frontend | Vercel | `FE:` | merge to `newprod` |

Ownership detail and history: `BE:.github/workflows/README.md`. Infra not listed above (for example the variant
bucket's policy, encryption, versioning) is hand-managed: do not change it in the console without a recorded PR or issue.

### 5.2 Terraform workflow

Before pushing (no AWS access needed):
```bash
cd deploy/terraform/newprod
terraform fmt -recursive
terraform init -backend=false
terraform validate
```
On the PR, `terraform-newprod.yml` plans with the read-only role `gha-terraform-plan-newprod`, runs `plan_guard.sh`,
and comments the plan. **Read the plan comment** before asking for review:
- `Plan: X to add, Y to change, Z to destroy` matches exactly what you meant.
- Any `must be replaced` or `will be destroyed`: **stop** and redesign. CI apply refuses them; only the owner applies
  those by hand, deliberately.
- Any `~ task_definition` or `aws_ecs_task_definition`: wrong (ECS split; plan_guard blocks it).
- Anything `biochat-`: wrong (old prod).

On merge, the apply job (role `gha-terraform-apply-newprod`, trusted only for pushes to `feat/newprod-baseline`)
re-plans, runs the guards, and applies exactly the saved plan. Watch it finish.

**Limits of the apply role** (`BE:deploy/terraform/newprod/terraform_apply_role.tf`):
- No SSM write: never add `aws_ssm_parameter`. Create the parameter by hand (5.7); Terraform only grants read IAM.
- No `ecs:RegisterTaskDefinition`: never add `aws_ecs_task_definition`.
- No `scheduler:*`: schedules are `aws_cloudwatch_event_rule` + target (see `corpus_jobs.tf`), not EventBridge Scheduler.
- `ProtectThisRole` deny: it cannot edit itself (5.3).
- `NeverDeleteDataStores` deny: no deleting RDS, ElastiCache, secrets, KMS keys, buckets, queues; no queue purge.
- IAM only on names `geneie-newprod-*` / `geneie-app-newprod-*`: name new roles and policies that way.
- S3: only lifecycle and CORS of `geneie-newprod-variant-files` (`VariantBucketLifecycleCors`).

**Adopting hand-made resources**: use an `import { to = ..., id = ... }` block (examples: `app_imports.tf`,
`ecs_services_imports.tf`, `s3_lifecycle.tf`). The plan must show the import and no replace.

**`lifecycle { ignore_changes }`** for fields another owner changes: ECS `task_definition` and `desired_count` (CI and
the scale-in Lambda), ASG `desired_capacity` and `max_size` (scaling), Lambda `image_uri` when CI rolls images
(`dataplane_v2.tf`).

### 5.3 Changing the apply role itself (manual targeted apply)

Example: `VariantBucketLifecycleCors` had to exist before CI could apply `s3_lifecycle.tf`.
1. PR 1 changes only `terraform_apply_role.tf`. The plan comment must show exactly one changed resource,
   `aws_iam_role_policy.gha_terraform_apply`, with exactly the added statement.
2. The owner, with admin credentials, on the PR 1 branch:
   ```bash
   cd deploy/terraform/newprod && terraform init
   terraform plan  -target=aws_iam_role_policy.gha_terraform_apply   # must be "1 to change", only that statement
   terraform apply -target=aws_iam_role_policy.gha_terraform_apply
   ```
   Anything else in the plan: stop.
3. Merge PR 1 (its CI plan now shows no change). Then PR 2 uses the new permission.

Never combine the role change and the resources it unlocks in one PR.

### 5.4 ECS task definitions (CI-registered, drift-gated)

- The JSON in `BE:deploy/ecs/` and `SC:deploy/ecs/` is the register input; CI fills in only the image.
  Change env, cpu, memory or secrets by editing the JSON in a PR.
- Backend tool `BE:deploy/ecs/ecs_taskdef.py`: `validate` (offline shape), `check <service>` (drift gate: live must
  equal the repo except the image), `render <service> --tag <tag>`. Tests: `python3 deploy/ecs/test_ecs_taskdef.py`.
- Never edit or register a live task definition by hand: the next deploy's drift gate stops. If an emergency forced
  a live change, `ecs_taskdef.py export <service>` and commit it in a PR the same day.
- A new `secrets` entry needs the key to exist in the secret **before** the PR merges, or the task cannot start
  (the circuit breaker then rolls back).

### 5.5 Order of operations for a new service, role or secret

1. **Terraform PR**: roles, secret (no value), log group, SG + datastore ingress, queue + DLQ + alarms, and
   `iam:PassRole` for the new roles on the deploy role: `PassTaskRoles` in `BE:deploy/terraform/newprod/deploy_role.tf`
   (backend CI) or the deploy roles in `BE:deploy/terraform/newprod/sidecar_exploratory_iam.tf` (sidecar CI).
   Missing PassRole = the deploy fails after merge. Merge; CI applies.
2. **Secret values**: `set_secret_keys.py` dry run, then `--apply` (5.6).
3. **SSM parameters**, if any, by hand (5.7).
4. **App PR**: code, task-definition JSON, CI wiring, tests in CI. A brand-new family must have a first revision
   before Terraform can create the service shell (`task_definition` is the family name): agree with the owner who
   registers it once from the rendered JSON. Then a small Terraform PR adds the service shell.
5. **Verify** (5.11).

### 5.6 Secrets

- Values never go in git, PRs, logs, chat or argv. Key **names** and meanings are documented in
  `BE:deploy/secrets/README.md`.
- Change keys with `python3 deploy/secrets/set_secret_keys.py <secret> --file <file|-> [--apply]`: dry run by default,
  prints key names only, refuses non-JSON and Terraform-owned secrets, aborts if the secret changed meanwhile.
  Delete the input file afterwards.
- A task reads secrets only at start: force a new deployment (or wait for the next CI deploy) after a change.
- A config-store key overrides its env fallback; changing the env value then changes only the fallback.

### 5.7 SSM parameters (by hand; the apply role cannot write them)

- `/geneie/newprod/capacity/{kind}` and `.../{kind}/max`: worker floor and max raise. Prefer the infra admin API
  (`/api/admin/infra/*`), which validates and time-boxes them.
- `/geneie/newprod/worker-scaling/...` (for example `hot-floor-schedule`) and `/geneie/newprod/exomiser/worker`
  (Exomiser worker gate): `aws ssm put-parameter --name <name> --type String --value '<json>' --overwrite`.
- Record every by-hand change (what, when, undo) in the PR or issue that needed it. Undo = put the previous value
  or delete the parameter.

### 5.8 One-off database changes (DDL)

No laptop connections to newprod databases. Pattern (no script in the repo yet):
- Run a one-off ECS task of family `geneie-newprod-corpus-jobs` (container `corpus-job`) on cluster
  `geneie-newprod`, private subnets, SG `geneie-newprod-corpus-jobs`, with a command override. The DSN comes from the
  task's secret env; never print it. Its corpus DSN targets the **sidecar Postgres** (where `literature_chunks`
  lives); its access to the app RDS is the literature-map read path only.
- DDL on any other database: the owner first confirms which task and DSN user has the privilege. Do not improvise.
- DDL is idempotent (`IF NOT EXISTS`), reviewed in a PR first, and run in a transaction.
- Prove it: probe insert inside a transaction, check it, then `ROLLBACK`. Log only "ok" and counts.
- Read the result in CloudWatch `/ecs/geneie-newprod-corpus-jobs`. Commit the DDL with the PR that needed it.

### 5.9 Worker code, AMIs, Module 1 head box

- **Worker boot code**: `newprod-ci.yml` publishes worker files to `s3://geneie-newprod-variant-files/exomiser-worker/`.
  Workers fetch them at boot. App code: verify (sha256 where a `.sha256` file is published, or an import check),
  then fall back to the AMI copy on a bad download. Required data files (for example `exomiser_data.py`): a bad
  fetch fails the boot so the instance is replaced. A new boot-time file picks one of these two rules explicitly.
- **AMIs** carry the slow-changing software. Built by hand-started Image Builder pipelines
  (`BE:deploy/worker-ami/README.md`), promoted only by a PR changing `image_id`. Rollback = PR to the previous id.
  Boot-time overrides (code, data paths, env) sit on top; do not bake fast-changing code into the AMI.
- **Module 1 control plane**: `newprod-ci.yml` ("Ship Module-1 control plane") uploads the poller, Nextflow files,
  unit file and pinned runtime (`BE:deploy/module1-nextflow-pins.txt`) and refreshes the head ASG
  `geneie-newprod-module1-head-asg` only when the shipped set's hash changed. A refresh interrupts running CPU-lane
  jobs: merge such changes when the queue is quiet. The head ASG stays at 1; never scale it to 0.

### 5.10 Config-store flags

- Write: `PUT /api/admin/config/<key>` (admin only, audited). Validation in `BE:biochat-backend/config_admin.py`
  (types, `check_bounds`, allow-lists, secret-looking values refused). Read: `config_store.get_*(key, default)`.
- **Create with the safe default first, then flip**:
  1. PR: seed the key in `seed_config.py` with the safe default (today's behaviour), add bounds/allow-list in
     `config_admin.py`, read it with the same default so a config outage means safe behaviour. Tests in CI.
  2. Merge and deploy. Seed (creates the key only if missing; never overwrites).
  3. Flip with the admin API, for a canary first where the feature supports it. Watch logs and parity.
  4. Undo = put the previous value. The kill switch wins over everything.

### 5.11 Rollback and verification

| Problem | Fastest safe undo |
|---|---|
| Feature behind a flag misbehaves | flip the flag or kill switch (seconds) |
| Bad app deploy | the circuit breaker rolls back a rollout that never gets healthy; otherwise revert PR -> CI redeploys; emergency: `aws ecs update-service --cluster geneie-newprod --service <svc> --task-definition <family>:<previous revision>`, then the revert PR |
| Bad Terraform change | revert PR -> CI apply (destroy/replace needs the owner) |
| Bad secret value | put the previous value with the script, force a new deployment |
| Bad worker AMI | PR back to the previous `image_id` |
| Bad frontend | revert PR to `newprod` (or promote the previous Vercel deployment) |

Verify with read-only commands:
- CI: every check's conclusion; the deploy step reached `services-stable`; `/ready` returned 200.
- `aws ecs describe-services --cluster geneie-newprod --services <svc>` (running count, deployments, events).
- `aws sqs get-queue-attributes --queue-url <url> --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible`.
- `aws ssm get-parameter --name <name>`.
- CloudWatch Logs Insights on `/ecs/geneie-newprod-backend`, `/ecs/geneie-newprod-backend-worker`,
  `/ecs/geneie-newprod-sidecar`, `/ecs/geneie-newprod-exploratory`, `/geneie/newprod/module1-poller`:
  ```
  fields @timestamp, @message | filter @message like /\[BACKEND JOB\]/ | sort @timestamp desc | limit 50
  ```
- Smoke against newprod: `cd deploy/e2e_replay && .venv/bin/python run.py --suite smoke` (`BE:deploy/e2e_replay/README.md`).

### 5.12 Never

- Push to, PR into, or merge into `main` (old prod) in any repo.
- Print, log, paste or commit a secret, token, DSN or credential, or pass one on the command line.
- Run `gh auth switch` or change global git credentials on a shared machine; pin the account per command.
- Put variant rows, genotypes, phenotypes or file contents in logs, metrics, errors, PRs or issues.
- Change AWS in the console without recording it in a PR or issue (Terraform drift and lost knowledge).
- Hand-edit or hand-register a live task definition.
- Scale the Module 1 head ASG to 0, or purge a queue, to "fix" something.
- Merge with a red or missing check, or merge a PR whose base moved without re-running CI.

## 6. Contracts and code rules

- **Failure contract.** A failed job carries `failure = {code, message, retryable}` (`BE:biochat-backend/job_lifecycle.py`
  `failure_record`; Module 1: `BE:biochat-backend/module1_layout.py` `module1_failure`). `message` is fixed,
  user-safe text. The raw `error` is admin-only: never in a non-admin response, notification or email
  (`module1_status` returns it only when `admin`; notifications use `_safe_failure_text`).
- **Flags.** Every behaviour change that can hurt users ships behind a config-store flag with a validated safe
  default and a kill switch (5.10).
- **Replacing a data path.** Shadow first (new path runs, old path serves), compare with a parity job that logs only
  counts and classes, then canary users, then flip. Keep the old path as fallback until the owner removes it
  (`dataplane_routing.py`, `annotation_parity.py`, `exomiser_parity_job.py`).
- **Column names.** Resolve user or agent column names case- and punctuation-insensitively to the stored names
  (`BE:biochat-backend/exploratory_scope.py` `column_resolver`). Never filter on a raw JSON key.
- **Alleles.** `-` is a real allele (indels), not "missing" (`BE:biochat-backend/variant_identity.py` `ALLELE_MISSING`).
- **Version skew.** A job that calls a script must not pass a flag the deployed script lacks: guard or test it
  (`BE:biochat-backend/test_ga_triage_job.py` `TestScriptFlagGuard`). Workers and API may run different versions
  during a deploy: message formats stay backward compatible for one release.
- **Tables** have an id default or sequence. Code checks it at startup and says so in logs
  (`SC:literature_chunks_db.py` `log_id_default_check`).
- **Hosts and tokens** come from env or a secret. No hard-coded hostnames or fallback hosts in new code. A missing
  host or token is an error the caller sees, not an empty result.
- **No global single-slot status** for multi-user work: queue per request with dedupe, status per chat or job.
- **Never DROP or invalidate while a load is in flight.** Defer the refresh until the load finishes.
- **Logs** hold counts, ids, durations and codes only. Never genetic data, file contents, prompts with patient
  data, message bodies, URIs with credentials or presigned URLs.
- **Auth.** Every endpoint checks the caller owns the resource; admin endpoints use the admin dependency and are
  audited. The frontend never decides security.
- **Tests** for new behaviour are wired into CI **in the same PR** (backend: an explicit line in
  `BE:.github/workflows/newprod-ci.yml`). A test that CI never runs does not count.
- **Docs** in the same PR for any new flag, queue, secret key, SSM parameter or runbook step.

## 7. Incident lessons (what happened -> rule)

| What happened | Rule |
|---|---|
| Enrichment and GA ran as daemon threads in the API; a deploy replaced the task and killed in-flight work | Long work is a queue job type on `backend-worker` |
| GA completion invalidated (DROPped) the sidecar chat table while a load was running; the load failed with `UndefinedTable` | Never DROP or invalidate while a load is in flight; defer the refresh |
| `print()` inside a SIGTERM handler raised `reentrant call inside <_io.BufferedWriter>` | Signal handlers only set a flag |
| Working-set dedupe treated `-` as a missing allele and dropped indels (655 vs 597 rows) | `-` is an allele; test row counts with indels |
| Explore filters matched JSON keys case-sensitively and returned 0 rows | Resolve column names case-insensitively to stored names |
| `literature_chunks.id` had no default, so every ingest insert failed | Every table has an id default or sequence; check it at startup |
| Explore used a hostname missing its `internal-` prefix and sent no token; literature returned 0 chunks silently | Hosts and tokens from env/secret; missing ones fail loudly |
| Literature ingest held one global slot; one chat's ingest blocked all others | No global single-slot status; queue per request |
| A job passed `--pedigree-json` to a script version without that flag | Guard script flags against the deployed version; test it in CI |
| The CI deploy role lacked `iam:PassRole` for new task roles; the deploy failed after merge | PassRole lands in Terraform before the task-def PR |
| Two PRs, each green alone, broke the base after both merged | `gh pr update-branch` and re-run CI before merging |
| Shared test files under `module1/rawdata/` were expired by the 14-day lifecycle rule | Check `s3_lifecycle.tf` before choosing a prefix; long-lived files go under a non-expiring prefix |
| A Terraform `aws_ssm_parameter` failed the CI apply (role cannot write SSM) | SSM parameters are created by hand; Terraform grants read only |
| The Module 1 head box was scaled to 0 by hand and Module 1 stopped for days | The head runs in an ASG pinned at 1; never scale it to 0 |

## 8. Working with GitHub and AWS from an agent

- Use the newprod branch of the repo as the PR base. Never `main`.
- Pin the GitHub account per command when the machine has several; never switch accounts globally.
- AWS: read-only commands are fine for verification. Anything that writes (put-parameter, update-service,
  run-task, secret writes, targeted applies) is done by, or explicitly approved by, the owner, and recorded.

## 9. PR checklist (paste into every PR description and fill in)

```markdown
### Newprod checklist
- [ ] Base branch is the newprod branch (BE `feat/newprod-baseline`, SC/FE `newprod`), not `main`
- [ ] ASK BEFORE BUILDING answers (scale, hot-tunability, data plane, latency, infosec) are in this description
- [ ] Reused pattern: ___ (or the reason new infra is needed: ___)
- [ ] Terraform: plan comment read; adds/changes/destroys as intended; no "must be replaced"/"destroyed"; no task_definition change; N/A
- [ ] New role? PassRole on the deploy role merged first; new secret key? value set before merge; SSM by hand recorded
- [ ] Tests added AND wired into CI in this PR (file/line): ___
- [ ] Flags: key, safe default, kill switch, bounds in config_admin, seeded; how to flip and undo: ___
- [ ] Secrets: none in code, logs, PR, argv
- [ ] Logs/errors: counts and ids only; no genetic data; raw error admin-only
- [ ] Docs updated (secrets README / flags / runbook): ___
- [ ] Rollback: ___ (flag flip / revert PR / previous task def)
- [ ] Verification after deploy: ___ (logs query, smoke suite, read-only checks)
- [ ] Base moved since last green CI? `gh pr update-branch` and re-ran CI
```

<!-- CORE END -->

## Repo section: frontend (`Geneie-ai-Org/geneie-frontend`)

PR base: **`newprod`**. Never `main` or `dev` for newprod work. `CLAUDE.md` in this repo describes the old-prod
flow (`dev` -> `main`); for newprod, branch from and open PRs against `newprod`. Vercel builds the newprod frontend
from `newprod` (`docs/FE_PORT_PLAN.md`, Rollback section). React + Vite; config in `vercel.json` (SPA rewrite).

### Gate before a PR

- There is no CI workflow and no lint or test script in `package.json`. The gate is: `npm ci && npm run build`
  passes with no new warnings, the Vercel preview deploy for the PR succeeds, and you clicked through the changed
  flow on the preview against the newprod API. Pure helpers go in `src/lib/` so they can be tested in isolation.
- Env: `src/config/env.js` reads `VITE_API_URL`, `VITE_FIREBASE_*`, `VITE_POSTHOG_*`,
  `VITE_VARIANT_DIRECT_UPLOAD_MIN_BYTES`. Values live in Vercel project settings, never in git. No secret may be a
  `VITE_*` variable: everything `VITE_*` ships to the browser.

### Map

| Area | Files |
|---|---|
| Routes | `src/main.jsx` |
| Sign-in gate | `src/components/ProtectedRoute.jsx` (waits for auth, redirects to `/auth` with `state.from`), `src/components/PublicRoute.jsx`, `src/lib/postLoginPath.js` (only `/app*` targets), `src/components/LegalConsentGate.jsx` |
| Admin pages | `src/pages/AdminPage.jsx`, `src/pages/AdminInfraPage.jsx`: allowed only when `adminWhoAmI()` (`src/services/backendApi.js`, `/api/admin/whoami`) says so |
| API client | `src/services/backendApi.js`, `src/services/infraApi.js`, `src/config/api.js` |
| Pipelines and polling | `src/hooks/useVariantPipeline.js`, `src/hooks/useModule1Pipeline.js`, `src/lib/module1PipelinePhases.js` |
| Chat eligibility | `src/lib/chatEligibilityPoll.js` (`nextEligibilitySettleStep`, `isEligibilitySettling`, `ELIGIBILITY_SETTLE_MAX_TICKS`) |
| Error text | `src/lib/humanizeError.js`, `getModule1FailureMessage` |

### Rules

- **Sign-in gate**: every app route sits behind `ProtectedRoute`; admin pages check `adminWhoAmI()` and redirect
  otherwise. The UI gate is convenience only: the backend enforces auth and admin on every call.
- **Polling**
  - Stop when the backend says `terminal: true` (`module1JobIsTerminal`, `module1ShouldKeepPolling`). Do not
    hard-code your own list of terminal statuses for new job types; the legacy list is only a fallback for old
    responses.
  - Poll with `setTimeout` chains (not `setInterval`), back off on errors, stop on unmount, conversation switch and
    auth failure. Use intervals in seconds (existing: 3-20 s), never tighter.
  - A new job type returns `terminal` and `failure` from its status endpoint; the UI reads those two fields.
- **Eligibility settle loop**: after an upload, GA or indexing, settle chat eligibility with the existing loop
  (`settleChatEligibility` in `useVariantPipeline.js`, rules in `chatEligibilityPoll.js`): bounded ticks, transient
  reasons keep waiting, a real failure stops. Do not add a parallel loop.
- **Errors**: show only `failure.message` or a fixed fallback (`getModule1FailureMessage`,
  `MODULE1_FAILED_FALLBACK`). Never render a raw `error`, stack trace, S3 key or hostname, even for admins in the
  normal UI.
- **Uploads**: files at or above `VITE_VARIANT_DIRECT_UPLOAD_MIN_BYTES` go direct to S3 with a presigned URL from the
  backend. Do not store, log or share a presigned URL; request a new one when needed.
- **No patient data in analytics**: PostHog events carry ids and counts only, never variants, phenotypes or file names.

### Known exceptions in this repo (do not copy)

- Older polls (Exomiser, ANNOVAR, GA) stop on local status lists instead of `terminal`. New code uses `terminal`.
- `failure.code` and `failure.retryable` are not used yet; use `retryable` to decide whether to offer "Try again".
