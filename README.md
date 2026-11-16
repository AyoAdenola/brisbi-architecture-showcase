# Brisbi — Architecture Showcase

The full repos are private. This one exists so engineers can look at the actual code and schema without me having to give access to the whole codebase.

---

## What is Brisbi?

Brisbi is an execution and accountability platform. The problem I'm solving: every other productivity tool trusts you to self-report. Brisbi doesn't. Every session you complete has to be verified before it counts — through AI proof analysis, community review, or both.

The side effect of doing that consistently is a **Brisbi Score** — basically a credit score for execution. It tracks whether you actually follow through on what you say you'll do.

**It's live:**
- Web: [brisbi.com](https://brisbi.com)
- Mobile: Google Play (React Native / Expo)

---

## Stack

| | |
|---|---|
| Backend | NestJS (TypeScript) |
| Frontend | Next.js 15 App Router |
| Mobile | React Native + Expo |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma |
| Payments | Stripe + Paystack |
| AI | Groq + Google Gemini |
| Storage | Cloudinary |
| Video | Daily.co |
| Vector search | pgvector |

---

## Data Model — 72 models

Five domains:

### Identity & Trust
`User`, `Profile`, `UserPreferences`, `Guardian`, `AccountabilityPartner`, `CreatorApplication`, `ScoreSnapshot`, `DailyActivity`, `UserAnalytics`

The score isn't one field. `User` stores five sub-scores separately: `trust_consistency_score`, `trust_authenticity_score`, `trust_tenure_score`, `trust_recovery_score`, `trust_community_score`. Each gets updated by different events and they combine into the final 0–1000 score.

### Execution Engine
`ExecutionSession`, `ExecutionPath`, `ExecutionPathTask`, `Artifact`, `ProofFlag`, `Task`, `Goal`, `UserGoalCheckIn`, `PostMortem`, `PodDayCompletion`

Each `ExecutionSession` stores both a `proof_hash` (exact match) and `proof_phash` (perceptual hash). The perceptual hash catches the same image re-uploaded with edits — brightness tweaks, crops, etc.

`ProofFlag` is the community review layer. Members flag suspicious sessions, and once a session crosses a threshold it goes back to AI re-verification.

### Pods
`Pod`, `PodMember`, `PodDay`, `PodChatMessage`, `PodInvitation`, `PodSubscriptionPlan`, `PodContent`, `PodContentAccess`, `ContentBundle`, `PodLiveSession`, `PodReport`, `PodPayment`, `PodDayCompletion`, `VideoPost`, `VideoUpdate`, `Announcement`, `ActivityFeed`, `CreatorSurvey`, `CreatorSurveyResponse`

Creator-led accountability groups. Each Pod runs on structured days (`PodDay`), can have paid content behind `PodContentAccess`, Stripe subscriptions, and live video via Daily.co. `PodContent` supports bundles — a `BUNDLE` type that references individual items through `ContentBundle`.

### Creator Economy
`PayoutAccount`, `CreatorBalance`, `WithdrawalRequest`, `WithdrawalAuditLog`, `PayoutAccountVerification`, `InnerCircle`, `InnerCircleMember`, `InnerCircleSession`, `InnerCircleContent`, `InnerCircleAnnouncement`, `ConsultationSession`, `CreatorAvailability`, `SessionBooking`, `Subscription`, `CoursePurchase`, `Course`, `Lesson`

Creators make money three ways: Pod subscriptions (Stripe), Inner Circle memberships, and 1:1 consultations. Consultations can be booked by non-users too — `visitor_name` and `visitor_email` sit directly on `ConsultationSession`.

Payouts go through five providers (`STRIPE`, `PAYSTACK`, `WISE`, `CRYPTO`, `MANUAL`). Withdrawals require OTP, go through fraud checks (`is_flagged`), and use idempotency keys.

### AI Companion
`AIContext`, `AICompanionPreference`, `ChatMessage`, `PresenceMessage`, `AgentLogger`, `AgentStepTrace`

Each user has a synthesized memory stored in `AIContext.synthesized_memory`. `AgentLogger` + `AgentStepTrace` are the observability layer — every agent run logs its inputs, outputs, tool calls, and errors at the step level.

---

## How the Brisbi Score works

Five pillars, each 0–100, combined into a 0–1000 score:

```
Consistency   35%  — weighted execution rate over 90 days
Authenticity  25%  — % of sessions that passed verification
Tenure        15%  — platform age + active days (capped at 2 years)
Recovery      15%  — did you come back after missing days?
Community     10%  — peer "REAL" votes on your submissions (capped at 60pts)
```

Every recalculation saves a row to `ScoreSnapshot` with all five component values, so score history and trends are queryable.

Separately, `User` tracks `momentum_score`, `current_streak`, `peak_streak`, `months_above_80_momentum`, `consecutive_months_above_80` — these drive tier progression (`BLUEPRINT` → `EXECUTOR` → `UNSTOPPABLE`).

---

## Anti-gaming

| | |
|---|---|
| `proof_hash` | byte-identical resubmission detection |
| `proof_phash` | perceptual hash — catches edited re-uploads |
| `Artifact.ai_status` | AI verdict: `PENDING` → `VERIFIED` / `REJECTED` |
| `ProofFlag` | community flagging, `@@unique([session_id, flagger_user_id])` so you can't double-vote |
| `flags_submitted_count` / `flags_overturned_count` | holds flaggers accountable for bad flags |
| `TrialAbuse` | device fingerprint + IP to catch multi-account trial abuse |
| `failed_login_attempts` + `account_locked_until` | brute-force lockout |
| `proof_risk_score` | rolling fraud score per user |

---

## Numbers

- 72 Prisma models
- 150+ API endpoints
- Blank repo to live product: 3 weeks, solo
- Mobile on Google Play
- Two payment rails: Stripe (USD) + Paystack (NGN)
- pgvector for AI memory search

---

## Files

| | |
|---|---|
| [`schema.prisma`](./schema.prisma) | full schema — all 72 models, relations, indexes, enums |
| [`samples/auth.controller.ts`](./samples/auth.controller.ts) | auth controller — guards, throttling, cookie pattern, OAuth |
| [`samples/trust-score.service.ts`](./samples/trust-score.service.ts) | score service — all 5 pillar calculations + the combiner |

---

## Author

**Ayo Adenola** — building Brisbi as a solo founder  
GitHub: [@AyoAdenola](https://github.com/AyoAdenola)  
[brisbi.com](https://brisbi.com)
