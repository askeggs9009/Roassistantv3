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

// Create models
export const User = mongoose.model('User', userSchema);
export const PendingVerification = mongoose.model('PendingVerification', pendingVerificationSchema);

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
}