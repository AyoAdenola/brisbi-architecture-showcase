import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const SCORE_BANDS = [
  { min: 0, max: 199, label: 'Beginner' },
  { min: 200, max: 399, label: 'Consistent' },
  { min: 400, max: 599, label: 'High Performer' },
  { min: 600, max: 799, label: 'Top Executor' },
  { min: 800, max: 1000, label: 'World Class' },
];

const getBand = (score: number) => SCORE_BANDS.find(b => score >= b.min && score <= b.max) || SCORE_BANDS[0];

@Injectable()
export class TrustScoreService {
  private readonly logger = new Logger(TrustScoreService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  // Pillar 1: Consistency
  // 90-day window, recency-weighted (recent days count slightly more)
  async calculateConsistencyScore(userId: string): Promise<number> {
    const windowDays = 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - windowDays);

    const activities = await this.prisma.dailyActivity.findMany({
      where: {
        user_id: userId,
        date: { gte: startDate },
      },
      orderBy: { date: 'asc' },
    });

    if (activities.length === 0) return 0;

    // Recent days weighted more heavily: linear ramp from 0.5x (oldest) to 1.5x (most recent)
    const total = activities.length;
    let weightedExecuted = 0;
    let weightedTotal = 0;

    activities.forEach((activity, index) => {
      const recencyWeight = 0.5 + (index / Math.max(total - 1, 1));
      weightedTotal += recencyWeight;
      if (activity.executed) {
        weightedExecuted += recencyWeight;
      }
    });

    const rate = weightedTotal > 0 ? weightedExecuted / weightedTotal : 0;
    return Math.round(rate * 100 * 10) / 10;
  }

  // writes the result back to User
  async updateConsistencyScore(userId: string): Promise<number> {
    const score = await this.calculateConsistencyScore(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        trust_consistency_score: score,
        trust_score_updated_at: new Date(),
      } as any,
    });
    this.logger.log(`[TrustScore] Consistency for ${userId}: ${score}`);
    return score;
  }

  // Pillar 2: Authenticity
  // % of completed sessions that weren't confirmed fraud — overturned flags don't count against you
  async calculateAuthenticityScore(userId: string): Promise<number> {
    const sessions = await this.prisma.executionSession.findMany({
      where: { user_id: userId, completed: true },
      select: { flag_status: true, is_verified: true } as any,
    });

    if (sessions.length === 0) return 100; // No history yet — neutral, not punished

    const confirmedFraud = sessions.filter((s: any) => s.flag_status === 'FRAUD_CONFIRMED').length;
    const clean = sessions.length - confirmedFraud;

    const rate = clean / sessions.length;
    return Math.round(rate * 100 * 10) / 10;
  }

  // writes the result back to User
  async updateAuthenticityScore(userId: string): Promise<number> {
    const score = await this.calculateAuthenticityScore(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        trust_authenticity_score: score,
        trust_score_updated_at: new Date(),
      } as any,
    });
    this.logger.log(`[TrustScore] Authenticity for ${userId}: ${score}`);
    return score;
  }

  // Pillar 3: Tenure
  // 50% calendar age + 50% active days, both capped at 730 days
  async calculateTenureScore(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { created_at: true } as any,
    });
    if (!user) return 0;

    const activeDaysCount = await this.prisma.dailyActivity.count({
      where: { user_id: userId, executed: true },
    });

    const ageInDays = Math.floor(
      (Date.now() - new Date((user as any).created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Tenure rewards BOTH calendar time since signup AND actual active engagement,
    // so a dormant account doesn't gain tenure just by existing.
    const CAP_DAYS = 730; // 2 years
    const calendarComponent = Math.min(ageInDays / CAP_DAYS, 1) * 50;
    const engagementComponent = Math.min(activeDaysCount / CAP_DAYS, 1) * 50;

    const score = calendarComponent + engagementComponent;
    return Math.round(score * 10) / 10;
  }

  // writes the result back to User
  async updateTenureScore(userId: string): Promise<number> {
    const score = await this.calculateTenureScore(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        trust_tenure_score: score,
        trust_score_updated_at: new Date(),
      } as any,
    });
    this.logger.log(`[TrustScore] Tenure for ${userId}: ${score}`);
    return score;
  }

  // Pillar 4: Recovery
  // 180-day window — did you come back after gaps? zero gaps = 100 by default
  async calculateRecoveryScore(userId: string): Promise<number> {
    const windowDays = 180;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - windowDays);

    const activities = await this.prisma.dailyActivity.findMany({
      where: { user_id: userId, date: { gte: startDate } },
      orderBy: { date: 'asc' },
    });

    if (activities.length === 0) return 100; // No history — neutral, not punished

    let gaps = 0;
    let recoveredGaps = 0;
    let inGap = false;

    for (let i = 0; i < activities.length; i++) {
      const executed = activities[i].executed;

      if (!executed && !inGap) {
        gaps++;
        inGap = true;
      } else if (executed && inGap) {
        recoveredGaps++;
        inGap = false;
      }
    }

    // If currently still in an unrecovered gap, don't count it yet — give them a chance
    if (gaps === 0) return 100;

    const recoveryRate = recoveredGaps / gaps;
    return Math.round(recoveryRate * 100 * 10) / 10;
  }

  // writes the result back to User
  async updateRecoveryScore(userId: string): Promise<number> {
    const score = await this.calculateRecoveryScore(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        trust_recovery_score: score,
        trust_score_updated_at: new Date(),
      } as any,
    });
    this.logger.log(`[TrustScore] Recovery for ${userId}: ${score}`);
    return score;
  }

  // Pillar 5: Community
  // REAL votes from peers, 2pts each, hard-capped at 60 so it can't carry the score
  async calculateCommunityScore(userId: string): Promise<number> {
    const sessions = await this.prisma.executionSession.findMany({
      where: { user_id: userId },
      select: { id: true },
    });
    const sessionIds = sessions.map((s) => s.id);
    if (sessionIds.length === 0) return 0;

    const realVotes = await this.prisma.proofFlag.count({
      where: { session_id: { in: sessionIds }, vote: 'REAL' } as any,
    });

    // Each real vote contributes a small amount, capped well before 100
    // so this pillar alone can never carry the score.
    const POINTS_PER_VOTE = 2;
    const CAP = 60;
    const score = Math.min(realVotes * POINTS_PER_VOTE, CAP);
    return score;
  }

  // writes the result back to User
  async updateCommunityScore(userId: string): Promise<number> {
    const score = await this.calculateCommunityScore(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        trust_community_score: score,
        trust_score_updated_at: new Date(),
      } as any,
    });
    this.logger.log(`[TrustScore] Community for ${userId}: ${score}`);
    return score;
  }

  // runs all 5 in parallel, applies weights, scales to 0-1000
  // runs alongside momentum_score for now — not replacing it yet
  async calculateFullTrustScore(userId: string): Promise<{
    finalScore: number;
    pillars: {
      consistency: number;
      authenticity: number;
      tenure: number;
      recovery: number;
      community: number;
    };
  }> {
    const [consistency, authenticity, tenure, recovery, community] = await Promise.all([
      this.updateConsistencyScore(userId),
      this.updateAuthenticityScore(userId),
      this.updateTenureScore(userId),
      this.updateRecoveryScore(userId),
      this.updateCommunityScore(userId),
    ]);

    const WEIGHTS = {
      consistency: 0.35,
      authenticity: 0.25,
      tenure: 0.15,
      recovery: 0.15,
      community: 0.10,
    };

    const weightedSum =
      consistency * WEIGHTS.consistency +
      authenticity * WEIGHTS.authenticity +
      tenure * WEIGHTS.tenure +
      recovery * WEIGHTS.recovery +
      community * WEIGHTS.community;

    // weightedSum is on a 0-100 scale (since each pillar is 0-100); scale to 0-1000
    const finalScore = Math.round(weightedSum * 10);

    this.logger.log(
      `[TrustScore] Full score for ${userId}: ${finalScore} ` +
      `(C:${consistency} A:${authenticity} T:${tenure} R:${recovery} Co:${community})`
    );

    const cappedScore = Math.min(finalScore, 1000);

    // Save snapshot for score history
    await this.prisma.scoreSnapshot.create({
      data: {
        user_id: userId,
        score: cappedScore,
        consistency,
        authenticity,
        tenure,
        recovery,
        community,
      } as any,
    }).catch((err) => {
      this.logger.warn(`[TrustScore] Failed to save score snapshot for ${userId}: ${err.message}`);
    });

    // Check if user crossed into a new score band and notify them
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { momentum_score: true },
      });
      const previousScore = Number(user?.momentum_score || 0);
      const previousBand = getBand(previousScore);
      const newBand = getBand(cappedScore);
      if (previousBand.label !== newBand.label && cappedScore > previousScore) {
        const messages: Record<string, string> = {
          'Consistent': 'You show up. You execute. Keep the streak alive.',
          'High Performer': 'You execute more than most people ever will.',
          'Top Executor': 'You are in the top tier of human execution.',
          'World Class': 'Fewer than 1% of people will ever reach this level.',
        };
        await this.notificationsService.createNotification({
          user_id: userId,
          title: `You just reached ${newBand.label} status 🎉`,
          body: messages[newBand.label] || `Your Brisbi Score hit ${cappedScore}.`,
          type: 'score_band_upgrade',
        });
        this.logger.log(`[TrustScore] Band upgrade notification sent to ${userId}: ${previousBand.label} → ${newBand.label}`);
      }
    } catch (err: any) {
      this.logger.warn(`[TrustScore] Band upgrade notification failed for ${userId}: ${err.message}`);
    }

    return {
      finalScore: cappedScore,
      pillars: { consistency, authenticity, tenure, recovery, community },
    };
  }
}
