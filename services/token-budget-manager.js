// Token Budget Management System
// Implements dynamic rolling token pools for efficient usage

export class TokenBudgetManager {
    constructor() {
        // Token pools per subscription tier (monthly)
        this.monthlyBudgets = {
            free: {
                totalTokens: 600000,      // 600k tokens/month (~$2 cost)
                dailyMax: 30000,          // Daily cap to prevent abuse
                rolloverPercent: 20,      // Can carry over 20% unused tokens
                warningThreshold: 0.8,    // Warn at 80% usage
                models: {
                    'claude-3-5-haiku': { multiplier: 0.5 },  // Uses half tokens
                    'claude-4-sonnet': { multiplier: 1.0 },    // Normal usage
                    'claude-4-opus': { multiplier: 3.0 }       // Triple tokens
                }
            },
            pro: {
                totalTokens: 3000000,      // 3M tokens/month (~$15 cost)
                dailyMax: 150000,
                rolloverPercent: 30,
                warningThreshold: 0.85,
                models: {
                    'claude-3-5-haiku': { multiplier: 0.3 },
                    'claude-4-sonnet': { multiplier: 1.0 },
                    'claude-4-opus': { multiplier: 2.0 }
                }
            },
            enterprise: {
                totalTokens: 10000000,     // 10M tokens/month (~$50 cost)
                dailyMax: 500000,
                rolloverPercent: 40,
                warningThreshold: 0.9,
                models: {
                    'claude-3-5-haiku': { multiplier: 0.2 },
                    'claude-4-sonnet': { multiplier: 0.8 },
                    'claude-4-opus': { multiplier: 1.5 }
                }
            }
        };

        // User token usage tracking
        this.userUsage = new Map();

        // Persistent storage path
        this.storagePath = './data/token-budgets.json';

        // Load existing data
        this.loadBudgetData();

        // Auto-save every 5 minutes
        setInterval(() => this.saveBudgetData(), 5 * 60 * 1000);
    }

    // Get or create user budget
    getUserBudget(userId, subscription = 'free') {
        if (!this.userUsage.has(userId)) {
            const now = new Date();
            this.userUsage.set(userId, {
                subscription,
                currentMonth: `${now.getFullYear()}-${now.getMonth() + 1}`,
                monthlyUsage: 0,
                dailyUsage: {},
                rolloverTokens: 0,
                lastReset: now.toISOString(),
                history: [],
                warnings: []
            });
        }

        const budget = this.userUsage.get(userId);
        this.checkAndResetPeriod(userId, budget);

        return budget;
    }

    // Check if budget period needs reset
    checkAndResetPeriod(userId, budget) {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;
        const today = now.toISOString().split('T')[0];

        // Monthly reset
        if (budget.currentMonth !== currentMonth) {
            const config = this.monthlyBudgets[budget.subscription];
            const unusedTokens = Math.max(0, config.totalTokens - budget.monthlyUsage);
            const rollover = Math.min(
                unusedTokens * (config.rolloverPercent / 100),
                config.totalTokens * 0.5  // Max 50% rollover
            );

            // Archive previous month
            budget.history.push({
                month: budget.currentMonth,
                usage: budget.monthlyUsage,
                rollover
            });

            // Reset for new month
            budget.currentMonth = currentMonth;
            budget.monthlyUsage = 0;
            budget.dailyUsage = {};
            budget.rolloverTokens = rollover;
            budget.lastReset = now.toISOString();
            budget.warnings = [];

            console.log(`[TOKEN BUDGET] Reset monthly budget for user ${userId}. Rollover: ${rollover} tokens`);
        }

        // Daily tracking (no reset, just tracking)
        if (!budget.dailyUsage[today]) {
            budget.dailyUsage[today] = 0;
        }
    }

    // Check if user can make request
    async canMakeRequest(userId, estimatedTokens, model, subscription = 'free') {
        const budget = this.getUserBudget(userId, subscription);
        const config = this.monthlyBudgets[subscription];
        const today = new Date().toISOString().split('T')[0];

        // Apply model multiplier
        const modelMultiplier = config.models[model]?.multiplier || 1.0;
        const adjustedTokens = Math.ceil(estimatedTokens * modelMultiplier);

        // Check daily limit
        const dailyUsed = budget.dailyUsage[today] || 0;
        if (dailyUsed + adjustedTokens > config.dailyMax) {
            return {
                allowed: false,
                reason: 'daily_limit',
                message: `Daily token limit reached. Used: ${dailyUsed}/${config.dailyMax}`,
                resetTime: this.getNextDayReset(),
                suggestion: 'Try again tomorrow or upgrade your plan'
            };
        }

        // Check monthly limit (including rollover)
        const totalAvailable = config.totalTokens + budget.rolloverTokens;
        if (budget.monthlyUsage + adjustedTokens > totalAvailable) {
            return {
                allowed: false,
                reason: 'monthly_limit',
                message: `Monthly token budget exhausted. Used: ${budget.monthlyUsage}/${totalAvailable}`,
                resetTime: this.getNextMonthReset(),
                suggestion: 'Upgrade to Pro for 5x more tokens'
            };
        }

        // Check if approaching limit (warning)
        const usagePercent = (budget.monthlyUsage + adjustedTokens) / totalAvailable;
        let warning = null;

        if (usagePercent >= config.warningThreshold) {
            warning = {
                level: usagePercent >= 0.95 ? 'critical' : 'warning',
                message: `${Math.round(usagePercent * 100)}% of monthly budget used`,
                remainingTokens: totalAvailable - budget.monthlyUsage - adjustedTokens,
                suggestion: usagePercent >= 0.95 ? 'Consider upgrading soon' : 'Monitor your usage'
            };

            // Record warning
            if (!budget.warnings.find(w => w.date === today)) {
                budget.warnings.push({
                    date: today,
                    percent: usagePercent,
                    level: warning.level
                });
            }
        }

        return {
            allowed: true,
            adjustedTokens,
            remainingToday: config.dailyMax - dailyUsed - adjustedTokens,
            remainingMonth: totalAvailable - budget.monthlyUsage - adjustedTokens,
            usagePercent,
            warning
        };
    }

    // Record token usage
    recordUsage(userId, actualTokens, model, subscription = 'free') {
        const budget = this.getUserBudget(userId, subscription);
        const config = this.monthlyBudgets[subscription];
        const today = new Date().toISOString().split('T')[0];

        // Apply model multiplier
        const modelMultiplier = config.models[model]?.multiplier || 1.0;
        const adjustedTokens = Math.ceil(actualTokens * modelMultiplier);

        // Update usage
        budget.monthlyUsage += adjustedTokens;
        budget.dailyUsage[today] = (budget.dailyUsage[today] || 0) + adjustedTokens;

        // Log significant usage
        if (adjustedTokens > 1000) {
            console.log(`[TOKEN BUDGET] User ${userId} used ${adjustedTokens} tokens (${model})`);
        }

        return {
            recorded: adjustedTokens,
            monthlyTotal: budget.monthlyUsage,
            dailyTotal: budget.dailyUsage[today]
        };
    }

    // Get usage statistics for user
    getUserStats(userId, subscription = 'free') {
        const budget = this.getUserBudget(userId, subscription);
        const config = this.monthlyBudgets[subscription];
        const today = new Date().toISOString().split('T')[0];

        const totalAvailable = config.totalTokens + budget.rolloverTokens;
        const remainingMonth = totalAvailable - budget.monthlyUsage;
        const remainingToday = config.dailyMax - (budget.dailyUsage[today] || 0);

        // Calculate daily average
        const daysInMonth = Object.keys(budget.dailyUsage).length || 1;
        const dailyAverage = Math.round(budget.monthlyUsage / daysInMonth);

        // Project end of month usage
        const now = new Date();
        const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
        const projectedUsage = budget.monthlyUsage + (dailyAverage * daysLeft);

        return {
            subscription,
            current: {
                monthly: budget.monthlyUsage,
                daily: budget.dailyUsage[today] || 0,
                rollover: budget.rolloverTokens
            },
            limits: {
                monthlyTotal: totalAvailable,
                monthlyBase: config.totalTokens,
                daily: config.dailyMax
            },
            remaining: {
                month: remainingMonth,
                today: remainingToday,
                percentUsed: Math.round((budget.monthlyUsage / totalAvailable) * 100)
            },
            analytics: {
                dailyAverage,
                projectedMonthly: projectedUsage,
                projectedOverage: Math.max(0, projectedUsage - totalAvailable),
                daysActive: daysInMonth,
                warnings: budget.warnings.length
            },
            recommendations: this.getRecommendations(budget, config, projectedUsage)
        };
    }

    // Get personalized recommendations
    getRecommendations(budget, config, projectedUsage) {
        const recommendations = [];
        const totalAvailable = config.totalTokens + budget.rolloverTokens;

        // Check if upgrade needed
        if (projectedUsage > totalAvailable * 0.9) {
            recommendations.push({
                type: 'upgrade',
                priority: 'high',
                message: 'You\'re on track to exceed your monthly budget',
                action: 'Consider upgrading to the next tier'
            });
        }

        // Check daily usage patterns
        const dailyValues = Object.values(budget.dailyUsage);
        if (dailyValues.length > 0) {
            const maxDaily = Math.max(...dailyValues);
            if (maxDaily > config.dailyMax * 0.8) {
                recommendations.push({
                    type: 'usage_pattern',
                    priority: 'medium',
                    message: 'You\'ve had days with very high usage',
                    action: 'Consider spreading requests throughout the day'
                });
            }
        }

        // Optimization suggestions
        if (budget.monthlyUsage > config.totalTokens * 0.5) {
            recommendations.push({
                type: 'optimization',
                priority: 'low',
                message: 'Enable smart routing to use Haiku for simple tasks',
                action: 'This can reduce token usage by 40-60%'
            });
        }

        return recommendations;
    }

    // Get next reset times
    getNextDayReset() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.toISOString();
    }

    getNextMonthReset() {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);
        return nextMonth.toISOString();
    }

    // Persistence methods
    async loadBudgetData() {
        try {
            const fs = await import('fs/promises');
            const data = await fs.readFile(this.storagePath, 'utf8');
            const parsed = JSON.parse(data);

            // Restore Map from saved data
            this.userUsage = new Map(Object.entries(parsed.userUsage || {}));

            console.log(`[TOKEN BUDGET] Loaded budget data for ${this.userUsage.size} users`);
        } catch (error) {
            console.log('[TOKEN BUDGET] No existing budget data found, starting fresh');
        }
    }

    async saveBudgetData() {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');

            // Ensure directory exists
            const dir = path.dirname(this.storagePath);
            await fs.mkdir(dir, { recursive: true });

            // Convert Map to object for JSON serialization
            const data = {
                userUsage: Object.fromEntries(this.userUsage),
                savedAt: new Date().toISOString()
            };

            await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2));

            console.log(`[TOKEN BUDGET] Saved budget data for ${this.userUsage.size} users`);
        } catch (error) {
            console.error('[TOKEN BUDGET] Failed to save budget data:', error);
        }
    }

    // Admin methods
    resetUserBudget(userId) {
        if (this.userUsage.has(userId)) {
            const budget = this.userUsage.get(userId);
            budget.monthlyUsage = 0;
            budget.dailyUsage = {};
            budget.warnings = [];
            console.log(`[TOKEN BUDGET] Reset budget for user ${userId}`);
            return true;
        }
        return false;
    }

    upgradeUserSubscription(userId, newSubscription) {
        const budget = this.getUserBudget(userId);
        budget.subscription = newSubscription;
        console.log(`[TOKEN BUDGET] Upgraded user ${userId} to ${newSubscription}`);
        return true;
    }
}

// Export singleton instance
export const tokenBudgetManager = new TokenBudgetManager();
export default tokenBudgetManager;