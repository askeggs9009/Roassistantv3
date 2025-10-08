import mongoose from 'mongoose';

// Database connection
let isConnected = false;

export async function connectToDatabase() {
    if (isConnected) {
        console.log('[DATABASE] Already connected to MongoDB');
        return;
    }

    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error('MONGODB_URI environment variable is not set');
        }

        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        isConnected = true;
        console.log('[DATABASE] ✅ Connected to MongoDB successfully');

        // Handle connection events
        mongoose.connection.on('error', (error) => {
            console.error('[DATABASE] ❌ MongoDB connection error:', error);
            isConnected = false;
        });

        mongoose.connection.on('disconnected', () => {
            console.log('[DATABASE] ⚠️ MongoDB disconnected');
            isConnected = false;
        });

    } catch (error) {
        console.error('[DATABASE] ❌ Failed to connect to MongoDB:', error.message);
        isConnected = false;
        throw error;
    }
}

// User Schema
const userSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: function() {
            return this.provider === 'email';
        }
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    picture: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    provider: {
        type: String,
        enum: ['email', 'google'],
        required: true
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    lastActive: {
        type: Date,
        default: Date.now
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    sessionCount: {
        type: Number,
        default: 0
    },
    totalMessages: {
        type: Number,
        default: 0
    },
    totalTokens: {
        type: Number,
        default: 0
    },
    monthlyTokensUsed: {
        type: Number,
        default: 0
    },
    monthlyTokensPeriodStart: {
        type: Date,
        default: Date.now
    },
    recaptchaScores: [{
        score: Number,
        action: String,
        timestamp: {
            type: Date,
            default: Date.now
        },
        ip: String
    }],
    subscription: {
        plan: {
            type: String,
            enum: ['free', 'pro', 'enterprise'],
            default: 'free'
        },
        status: {
            type: String,
            enum: ['active', 'canceled', 'past_due', 'trialing'],
            default: 'active'
        },
        stripeCustomerId: String,
        stripeSubscriptionId: String,
        currentPeriodStart: Date,
        currentPeriodEnd: Date,
        cancelAtPeriodEnd: {
            type: Boolean,
            default: false
        },
        updatedAt: Date
    },
    chats: [{
        type: mongoose.Schema.Types.Mixed,
        default: []
    }],
    scripts: [{
        type: mongoose.Schema.Types.Mixed,
        default: []
    }],
    preferences: {
        theme: {
            type: String,
            enum: ['light', 'dark', 'auto'],
            default: 'dark'
        },
        notifications: {
            type: Boolean,
            default: true
        },
        language: {
            type: String,
            default: 'en'
        },
        emailNotifications: {
            type: Boolean,
            default: true
        },
        marketingEmails: {
            type: Boolean,
            default: false
        }
    }
}, {
    timestamps: true
});

// Index for faster queries
// Indexes already created by unique: true in schema
// Only add index for non-unique fields
userSchema.index({ 'subscription.stripeCustomerId': 1 });

// Pending Verification Schema
const pendingVerificationSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    verificationCode: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    expires: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 } // Auto-delete expired documents
    },
    attempts: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for faster queries and auto-cleanup
// Email already has unique: true, only need expires index
pendingVerificationSchema.index({ expires: 1 });

// Analytics Schema
const analyticsSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        required: true
    },
    activeUsers: {
        type: Number,
        default: 0
    },
    newUsers: {
        type: Number,
        default: 0
    },
    totalSessions: {
        type: Number,
        default: 0
    },
    totalMessages: {
        type: Number,
        default: 0
    },
    averageSessionDuration: {
        type: Number, // in minutes
        default: 0
    },
    usersByPlan: {
        free: { type: Number, default: 0 },
        pro: { type: Number, default: 0 },
        enterprise: { type: Number, default: 0 }
    },
    popularModels: [{
        model: String,
        count: Number
    }],
    peakConcurrentUsers: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Chat Log Schema
const chatLogSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    userEmail: {
        type: String,
        required: true,
        index: true
    },
    userName: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    response: {
        type: String,
        required: true
    },
    model: {
        type: String,
        required: true
    },
    tokenCount: {
        type: Number,
        default: 0
    },
    inputTokens: {
        type: Number,
        default: 0
    },
    outputTokens: {
        type: Number,
        default: 0
    },
    responseTime: {
        type: Number, // in milliseconds
        default: 0
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    ip: String,
    userAgent: String,
    error: String,
    subscription: {
        type: String,
        default: 'free'
    }
}, {
    timestamps: true
});

// Session Schema for tracking active users
const sessionSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    userEmail: {
        type: String,
        required: true
    },
    sessionId: {
        type: String,
        required: true,
        unique: true
    },
    startTime: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    endTime: Date,
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    ip: String,
    userAgent: String,
    pageViews: [{
        page: String,
        timestamp: Date
    }]
}, {
    timestamps: true
});

// Admin Activity Log Schema
const adminLogSchema = new mongoose.Schema({
    adminId: {
        type: String,
        required: true
    },
    adminEmail: {
        type: String,
        required: true
    },
    action: {
        type: String,
        required: true
    },
    details: mongoose.Schema.Types.Mixed,
    targetUser: String,
    ip: String,
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for faster queries
analyticsSchema.index({ date: 1, type: 1 }, { unique: true });
chatLogSchema.index({ timestamp: -1 });
chatLogSchema.index({ userEmail: 1, timestamp: -1 });
sessionSchema.index({ lastActivity: 1 });
sessionSchema.index({ userId: 1, isActive: 1 });
adminLogSchema.index({ timestamp: -1 });

// Create models
export const User = mongoose.model('User', userSchema);
export const PendingVerification = mongoose.model('PendingVerification', pendingVerificationSchema);
export const Analytics = mongoose.model('Analytics', analyticsSchema);
export const ChatLog = mongoose.model('ChatLog', chatLogSchema);
export const Session = mongoose.model('Session', sessionSchema);
export const AdminLog = mongoose.model('AdminLog', adminLogSchema);

// Database helper functions
export class DatabaseManager {
    static async findUserByEmail(email) {
        try {
            return await User.findOne({ email: email.toLowerCase() });
        } catch (error) {
            console.error('[DATABASE] Error finding user by email:', error);
            throw error;
        }
    }

    static async findUserById(id) {
        try {
            return await User.findOne({ id: id });
        } catch (error) {
            console.error('[DATABASE] Error finding user by ID:', error);
            throw error;
        }
    }

    static async createUser(userData) {
        try {
            const user = new User(userData);
            await user.save();
            console.log(`[DATABASE] ✅ User created: ${userData.email}`);
            return user;
        } catch (error) {
            console.error('[DATABASE] Error creating user:', error);
            throw error;
        }
    }

    static async updateUser(email, updates) {
        try {
            const user = await User.findOneAndUpdate(
                { email: email.toLowerCase() },
                updates,
                { new: true, runValidators: true }
            );
            if (user) {
                console.log(`[DATABASE] ✅ User updated: ${email}`);
            }
            return user;
        } catch (error) {
            console.error('[DATABASE] Error updating user:', error);
            throw error;
        }
    }

    static async createPendingVerification(verificationData) {
        try {
            // Remove any existing pending verification for this email
            await PendingVerification.deleteOne({ email: verificationData.email.toLowerCase() });

            const verification = new PendingVerification(verificationData);
            await verification.save();
            console.log(`[DATABASE] ✅ Pending verification created: ${verificationData.email}`);
            return verification;
        } catch (error) {
            console.error('[DATABASE] Error creating pending verification:', error);
            throw error;
        }
    }

    static async findPendingVerification(email) {
        try {
            return await PendingVerification.findOne({ email: email.toLowerCase() });
        } catch (error) {
            console.error('[DATABASE] Error finding pending verification:', error);
            throw error;
        }
    }

    static async deletePendingVerification(email) {
        try {
            const result = await PendingVerification.deleteOne({ email: email.toLowerCase() });
            if (result.deletedCount > 0) {
                console.log(`[DATABASE] ✅ Pending verification deleted: ${email}`);
            }
            return result;
        } catch (error) {
            console.error('[DATABASE] Error deleting pending verification:', error);
            throw error;
        }
    }

    static async getAllUsers() {
        try {
            return await User.find({});
        } catch (error) {
            console.error('[DATABASE] Error getting all users:', error);
            throw error;
        }
    }

    static async getUserCount() {
        try {
            return await User.countDocuments();
        } catch (error) {
            console.error('[DATABASE] Error getting user count:', error);
            return 0;
        }
    }

    // Analytics methods
    static async updateAnalytics(date, type, updates) {
        try {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);

            return await Analytics.findOneAndUpdate(
                { date: startOfDay, type },
                { $inc: updates },
                { new: true, upsert: true }
            );
        } catch (error) {
            console.error('[DATABASE] Error updating analytics:', error);
            throw error;
        }
    }

    static async getAnalytics(startDate, endDate, type = 'daily') {
        try {
            return await Analytics.find({
                date: { $gte: startDate, $lte: endDate },
                type
            }).sort({ date: 1 });
        } catch (error) {
            console.error('[DATABASE] Error getting analytics:', error);
            throw error;
        }
    }

    // Chat log methods
    static async saveChatLog(logData) {
        try {
            const log = new ChatLog(logData);
            await log.save();
            return log;
        } catch (error) {
            console.error('[DATABASE] Error saving chat log:', error);
            throw error;
        }
    }

    static async getChatLogs(filter = {}, options = {}) {
        try {
            const { page = 1, limit = 50, sort = { timestamp: -1 } } = options;
            const skip = (page - 1) * limit;

            const logs = await ChatLog.find(filter)
                .sort(sort)
                .limit(limit)
                .skip(skip);

            const total = await ChatLog.countDocuments(filter);

            return {
                logs,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            console.error('[DATABASE] Error getting chat logs:', error);
            throw error;
        }
    }

    // Session methods
    static async createSession(sessionData) {
        try {
            const session = new Session(sessionData);
            await session.save();
            return session;
        } catch (error) {
            console.error('[DATABASE] Error creating session:', error);
            throw error;
        }
    }

    static async updateSession(sessionId, updates) {
        try {
            return await Session.findOneAndUpdate(
                { sessionId },
                updates,
                { new: true }
            );
        } catch (error) {
            console.error('[DATABASE] Error updating session:', error);
            throw error;
        }
    }

    static async getActiveSessions() {
        try {
            // Sessions active in the last 5 minutes
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            return await Session.find({
                isActive: true,
                lastActivity: { $gte: fiveMinutesAgo }
            });
        } catch (error) {
            console.error('[DATABASE] Error getting active sessions:', error);
            throw error;
        }
    }

    static async endInactiveSessions() {
        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            return await Session.updateMany(
                {
                    isActive: true,
                    lastActivity: { $lt: fiveMinutesAgo }
                },
                {
                    $set: {
                        isActive: false,
                        endTime: new Date()
                    }
                }
            );
        } catch (error) {
            console.error('[DATABASE] Error ending inactive sessions:', error);
            throw error;
        }
    }

    // Admin log methods
    static async logAdminAction(adminId, adminEmail, action, details) {
        try {
            const log = new AdminLog({
                adminId,
                adminEmail,
                action,
                details,
                timestamp: new Date()
            });
            await log.save();
            return log;
        } catch (error) {
            console.error('[DATABASE] Error logging admin action:', error);
            throw error;
        }
    }

    static async getAdminLogs(filter = {}, limit = 100) {
        try {
            return await AdminLog.find(filter)
                .sort({ timestamp: -1 })
                .limit(limit);
        } catch (error) {
            console.error('[DATABASE] Error getting admin logs:', error);
            throw error;
        }
    }

    // User data sync methods
    static async saveUserChats(email, chats) {
        try {
            const user = await User.findOneAndUpdate(
                { email: email.toLowerCase() },
                {
                    chats: chats,
                    lastActive: new Date()
                },
                { new: true }
            );
            if (user) {
                console.log(`[DATABASE] ✅ User chats saved: ${email} (${Object.keys(chats || {}).length} chats)`);
            }
            return user;
        } catch (error) {
            console.error('[DATABASE] Error saving user chats:', error);
            throw error;
        }
    }

    static async saveUserScripts(email, scripts) {
        try {
            const user = await User.findOneAndUpdate(
                { email: email.toLowerCase() },
                {
                    scripts: scripts,
                    lastActive: new Date()
                },
                { new: true }
            );
            if (user) {
                console.log(`[DATABASE] ✅ User scripts saved: ${email} (${scripts?.length || 0} scripts)`);
            }
            return user;
        } catch (error) {
            console.error('[DATABASE] Error saving user scripts:', error);
            throw error;
        }
    }

    static async saveUserProjects(email, projects) {
        try {
            const user = await User.findOneAndUpdate(
                { email: email.toLowerCase() },
                {
                    'preferences.projects': projects,
                    lastActive: new Date()
                },
                { new: true }
            );
            if (user) {
                console.log(`[DATABASE] ✅ User projects saved: ${email} (${projects?.length || 0} projects)`);
            }
            return user;
        } catch (error) {
            console.error('[DATABASE] Error saving user projects:', error);
            throw error;
        }
    }

    static async getUserData(email) {
        try {
            const user = await User.findOne({ email: email.toLowerCase() });
            if (user) {
                return {
                    chats: user.chats || {},
                    scripts: user.scripts || [],
                    projects: user.preferences?.projects || []
                };
            }
            return null;
        } catch (error) {
            console.error('[DATABASE] Error getting user data:', error);
            throw error;
        }
    }
}