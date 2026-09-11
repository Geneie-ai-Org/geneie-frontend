# Geneie Privacy Policy (Closed Beta)

**Version:** `2026-09-11`  
**Effective:** 2026-09-11  
**Product:** geneie.chat / Geneie (Omixir)

This Policy explains what we collect, how we use it, where it is processed, and your choices during closed beta. It should be read with the Terms of Use (`2026-09-11`).

---

## 1. Who we are

**Controller (for beta):** Omixir / Geneie operating team contacting **support@geneie.chat**.  
Primary infrastructure region for application data at rest: **AWS ap-south-1 (Mumbai, India)**, unless we notify you otherwise.

---

## 2. What we collect

| Category | Examples |
|----------|----------|
| Account | Email, Firebase auth identifiers, plan/tier, device IDs used for limits |
| Usage | Conversations, prompts, uploads (VCF/TSV/FASTQ paths as configured), job logs, quotas |
| Technical | IP, browser/device metadata, security and audit logs |
| Billing | Customer/subscription IDs via payment provider (e.g. Dodo); we do not store full card numbers |
| Legal | Timestamp and version of Terms/Privacy you accepted |

**Beta rule:** Do **not** upload identifiable patient PHI unless you have a separate written agreement with us. Prefer de-identified data.

---

## 3. How we use data

- Provide and secure the Service (auth, storage, pipelines, chat, reports).  
- Enforce plan limits and prevent abuse.  
- Improve reliability and features (including debugging with logs).  
- Comply with law and enforce Terms.  
- Process payments and subscriptions.

We do **not** sell your personal data.

---

## 4. AI and third-party processors (important for India & US users)

To run Geneie we use subprocessors. Some processing may occur **outside India** (and outside the United States) on the request path, for example:

| Processor / system | Typical purpose | Region note (beta) |
|--------------------|-----------------|-------------------|
| AWS (compute, DB, object storage, logs) | Host app and files | Primary **ap-south-1 (India)** for app data at rest |
| AWS Bedrock / LLM providers | Chat and interpretation assistance | May use **global or non-India** model endpoints unless we configure otherwise |
| Perplexity (if enabled) | Web-grounded answers | Typically **outside India** |
| NCBI / literature APIs | Literature lookup | Typically **US-hosted public APIs** |
| Firebase Auth | Login | Google infrastructure (global) |
| Payment provider (e.g. Dodo) | Checkout | Per provider’s regions |

**Honest disclosure:** Application databases and files for new-prod are designed to reside in **India (ap-south-1)**. However, **prompts and derived text sent to LLMs or literature/web tools may leave India** (and may leave the US) unless we enable an in-region-only configuration. We will not claim “your data never leaves America” or “never leaves India” for the full chat path until that is technically true.

US users: if you require a US-only or HIPAA/BAA-covered deployment, contact us — that is a **separate commercial/compliance arrangement**, not the default closed beta.

---

## 5. Legal bases / compliance posture (beta)

- **India:** We aim to align closed-beta practices with principles under the Digital Personal Data Protection Act, 2023 (lawful use, purpose limitation, security, and user rights as applicable). Formal DPDP registrations/policies will be finalized for production scale.  
- **US / other:** Default beta is **not** a HIPAA-covered service unless agreed in writing. You are responsible for not uploading PHI in violation of your obligations.

---

## 6. Retention

- Account and conversation data: retained while your account is active and for a reasonable period after for backups, disputes, and legal requirements.  
- Logs: retained for security and operations (typically weeks to months).  
- You may request deletion of your account data subject to legal holds and backup cycles (see §8).

---

## 7. Security

We use access controls, encryption in transit (TLS), encryption at rest for managed databases where configured, and audit logging on the new-prod stack. No method of transmission or storage is 100% secure.

---

## 8. Your choices

- Access/update account email via the product auth provider.  
- Request export or deletion of account-associated data: **support@geneie.chat**.  
- Withdraw consent by stopping use and requesting account closure (we may retain limited records as required by law).  
- Re-accept Terms/Privacy when we publish a new version in-product.

---

## 9. Children

Geneie is not directed to children under 18. Do not use the Service if you are under 18.

---

## 10. International transfers

Where data is transferred internationally (see §4), we rely on appropriate contractual and technical measures and your acceptance of this Policy for beta use.

---

## 11. Changes

We may update this Policy. Material changes will bump the version shown in-product. Continued use after accepting a new version constitutes acceptance.

---

## 12. Contact

**support@geneie.chat**

