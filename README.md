# Brisbi Platform — Architecture Showcase

> **Note:** The full codebase is private to protect business logic and payment infrastructure. This repository exists so engineers and hiring teams can inspect the architecture, data model, and code patterns behind the live product.

---

## What Is Brisbi?

Brisbi is an **AI-verified execution and accountability platform**. The core thesis: most productivity tools let users self-report progress. Brisbi doesn't. Every session completion must be verified — by AI image analysis, multimodal review, or community consensus — before it counts.

The by-product of consistent, verified execution is the **Brisbi Score**: a composite trust score analogous to a credit score, but for personal execution. It measures whether someone actually does what they say they will do.

**Live product:**
- Web platform: [brisbi.com](https://brisbi.com)
- Mobile app: live on Google Play (React Native / Expo)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | NestJS (TypeScript) |
| Frontend (web) | Next.js 15 App Router (TypeScript) |
| Mobile | React Native + Expo |
| Database | PostgreSQL via Supabase |
| ORM | Prisma |
| Payments | Stripe (USD) + Paystack (NGN) |
| AI / Verification | Groq + Google Gemini |
| File storage | Cloudinary |
| Real-time video | Daily.co |
| Vector search | pgvector (via Prisma `postgresqlExtensions`) |

---

## Data Model — 72 Prisma Models

The schema covers five product domains:

### 1. Identity & Trust
`User`, `Profile`, `UserPreferences`, `Guardian`, `AccountabilityPartner`, `CreatorApplication`, `ScoreSnapshot`, `DailyActivity`, `UserAnalytics`

The `User` model tracks five independent trust sub-scores that compose into the Brisbi Score:
- `trust_consistency_score` — execution rate over time
- `trust_authenticity_score` — proof verification pass rate
- `trust_tenure_score` — platform longevity
- `trust_recovery_score` — rebound after missed sessions
- `trust_community_score` — peer validation behaviour

### 2. Execution Engine
`ExecutionSession`, `ExecutionPath`, `ExecutionPathTask`, `Artifact`, `ProofFlag`, `Task`, `Goal`, `UserGoalCheckIn`, `PostMortem`, `PodDayCompletion`

An `ExecutionSession` stores a `proof_hash` and `proof_phash` (perceptual hash) of the submitted proof media. This enables duplicate-proof detection: the same image, re-uploaded with minor edits, is caught via perceptual distance comparison.

The `ProofFlag` model implements community review: members can flag a session as fake. When a session accumulates enough flags, it escalates to AI re-verification.

### 3. Pods (Group Accountability)
`Pod`, `PodMember`, `PodDay`, `PodChatMessage`, `PodInvitation`, `PodSubscriptionPlan`, `PodContent`, `PodContentAccess`, `ContentBundle`, `PodLiveSession`, `PodReport`, `PodPayment`, `PodDayCompletion`, `VideoPost`, `VideoUpdate`, `Announcement`, `ActivityFeed`, `CreatorSurvey`, `CreatorSurveyResponse`

Pods are creator-led accountability groups. A Pod has structured days (`PodDay`), optional paid content (`PodContent` with `PodContentAccess`), Stripe subscription plans, and live video sessions via Daily.co.

The `PodContent` model supports a self-referential bundle structure: a `BUNDLE` content type links to individual items via the `ContentBundle` join table.

### 4. Creator Economy
`PayoutAccount`, `CreatorBalance`, `WithdrawalRequest`, `WithdrawalAuditLog`, `PayoutAccountVerification`, `InnerCircle`, `InnerCircleMember`, `InnerCircleSession`, `InnerCircleContent`, `InnerCircleAnnouncement`, `ConsultationSession`, `CreatorAvailability`, `SessionBooking`, `Subscription`, `CoursePurchase`, `Course`, `Lesson`

Creators earn through three channels:
1. **Pod subscriptions** — recurring via Stripe
2. **Inner Circle** — private community with its own sessions and content
3. **Consultations** — 1:1 bookings, available to both registered users and anonymous visitors (`visitor_name`, `visitor_email` on `ConsultationSession`)

Payouts support multiple providers (`PayoutProvider` enum: `STRIPE`, `PAYSTACK`, `WISE`, `CRYPTO`, `MANUAL`). Withdrawal requests go through OTP verification, fraud detection (`is_flagged`), and idempotency keying.

### 5. AI Companion
`AIContext`, `AICompanionPreference`, `ChatMessage`, `PresenceMessage`, `AgentLogger`, `AgentStepTrace`

The AI companion maintains a synthesized memory per user (`AIContext.synthesized_memory`). `AgentLogger` and `AgentStepTrace` are the observability layer for AI agent runs — input, output, tool calls, verification status, and error traces are all stored per step.

---

## Brisbi Score Architecture

The Brisbi Score is not a single field. It is computed from five weighted sub-scores, each updated by distinct system events:

```
Brisbi Score
├── Consistency Score    ← execution sessions completed on schedule
├── Authenticity Score   ← AI + community proof verification results
├── Tenure Score         ← account age and continuous engagement
├── Recovery Score       ← how quickly streaks are rebuilt after a break
└── Community Score      ← flagging accuracy; contribution to peer review
```

Historical snapshots are stored in `ScoreSnapshot` with individual component values, enabling trend charts and momentum tracking.

The `User` model also tracks `momentum_score`, `current_streak`, `peak_streak`, `months_above_80_momentum`, and `consecutive_months_above_80` — these feed tier progression (`UserTier`: `BLUEPRINT` → `EXECUTOR` → `UNSTOPPABLE`).

---

## Anti-Gaming Layers

Brisbi has multiple layers to prevent fake proof submissions:

| Layer | Implementation |
|---|---|
| Perceptual hash | `proof_phash` on `ExecutionSession` — detects visually similar re-uploads |
| Exact hash | `proof_hash` — detects byte-identical resubmissions |
| AI verification | `Artifact.ai_status` (`PENDING` → `VERIFIED` / `REJECTED`) |
| Community flagging | `ProofFlag` model — `@@unique([session_id, flagger_user_id])` prevents double-voting |
| Flagger accountability | `User.flags_submitted_count` and `flags_overturned_count` — tracks flagger accuracy |
| Trial abuse detection | `TrialAbuse` — device fingerprint + IP tracking for multi-account trial abuse |
| Account lockout | `User.failed_login_attempts` + `account_locked_until` |
| Fraud scoring | `User.proof_risk_score`, `flagged_submissions`, `cleared_submissions`, `fraud_confirmations` |

---

## Scale Numbers

- **72 Prisma models** across 5 product domains
- **150+ API endpoints** (NestJS controllers, TypeScript, fully typed request/response)
- **Shipped from blank repo to live product in 3 weeks** (solo founder build)
- **Mobile app live on Google Play** (React Native + Expo)
- **Dual payment rails**: Stripe (USD) + Paystack (NGN) with multi-provider payout routing
- **Vector search**: pgvector extension for AI memory similarity queries

---

## Sample Files

| File | What it shows |
|---|---|
| [`schema.prisma`](./schema.prisma) | Full 72-model schema with relations, indexes, and enums |
| [`samples/auth.controller.ts`](./samples/auth.controller.ts) | NestJS controller pattern — guards, decorators, typed DTOs |
| [`samples/brisbi-score.service.ts`](./samples/brisbi-score.service.ts) | Service pattern — Prisma transactions, score computation logic |

---

## Repository Structure

```
brisbi-architecture-showcase/
├── README.md                        ← this file
├── schema.prisma                    ← full Prisma schema
├── samples/
│   ├── auth.controller.ts           ← NestJS auth controller
│   └── brisbi-score.service.ts      ← Brisbi Score service
└── screenshots/
    └── (product screenshots)
```

---

## Author

**Ayo Adenola** — Solo founder, CEO & developer  
GitHub: [@AyoAdenola](https://github.com/AyoAdenola)  
Product: [brisbi.com](https://brisbi.com)
