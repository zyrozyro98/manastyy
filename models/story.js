import mongoose from 'mongoose';

const storySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    mediaUrl: {
        type: String,
        required: true
    },
    mediaType: {
        type: String,
        enum: ['image', 'video'],
        required: true,
        index: true
    },
    thumbnailUrl: {
        type: String
    },
    caption: {
        type: String,
        maxlength: 500,
        trim: true
    },
    allowReplies: {
        type: Boolean,
        default: true
    },
    allowSharing: {
        type: Boolean,
        default: true
    },
    views: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        viewedAt: {
            type: Date,
            default: Date.now
        },
        viewDuration: {
            type: Number, // مدة المشاهدة بالثواني (للفيديوهات)
            default: 0
        }
    }],
    reactions: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        type: {
            type: String,
            enum: ['like', 'love', 'laugh', 'wow', 'sad', 'angry'],
            required: true
        },
        reactedAt: {
            type: Date,
            default: Date.now
        }
    }],
    replies: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        text: {
            type: String,
            required: true,
            maxlength: 1000,
            trim: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        replies: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            text: {
                type: String,
                required: true,
                maxlength: 1000,
                trim: true
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }]
    }],
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            index: '2dsphere'
        },
        name: String,
        address: String
    },
    tags: [{
        type: String,
        trim: true,
        maxlength: 50,
        index: true
    }],
    expiresAt: {
        type: Date,
        required: true,
        index: true,
        expires: 0 // TTL index للحذف التلقائي
    },
    metrics: {
        viewCount: {
            type: Number,
            default: 0
        },
        replyCount: {
            type: Number,
            default: 0
        },
        reactionCount: {
            type: Number,
            default: 0
        },
        shareCount: {
            type: Number,
            default: 0
        },
        engagementRate: {
            type: Number,
            default: 0
        }
    },
    deleted: {
        isDeleted: {
            type: Boolean,
            default: false
        },
        deletedAt: Date,
        deletedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    metadata: {
        duration: {
            type: Number, // مدة الفيديو بالثواني
            default: 0
        },
        fileSize: {
            type: Number
        },
        aspectRatio: {
            type: String // نسبة الأبعاد
        },
        filters: {
            type: String // الفلاتر المستخدمة
        },
        isHighQuality: {
            type: Boolean,
            default: false
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// فهارس
storySchema.index({ userId: 1, createdAt: -1 });
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ location: '2dsphere' });
storySchema.index({ tags: 1 });
storySchema.index({ 'metrics.viewCount': -1 });

// virtuals
storySchema.virtual('user', {
    ref: 'User',
    localField: 'userId',
    foreignField: '_id',
    justOne: true
});

storySchema.virtual('isActive').get(function() {
    return this.expiresAt > new Date() && !this.deleted.isDeleted;
});

storySchema.virtual('viewerCount').get(function() {
    return this.views.length;
});

storySchema.virtual('reactionSummary').get(function() {
    const summary = {};
    this.reactions.forEach(reaction => {
        summary[reaction.type] = (summary[reaction.type] || 0) + 1;
    });
    return summary;
});

// methods
storySchema.methods.addView = function(userId, duration = 0) {
    const existingView = this.views.find(view => 
        view.userId && view.userId.equals(userId)
    );
    
    if (!existingView) {
        this.views.push({
            userId: userId,
            viewedAt: new Date(),
            viewDuration: duration
        });
        
        this.metrics.viewCount = this.views.length;
        this.calculateEngagementRate();
    } else if (duration > 0) {
        // تحديث مدة المشاهدة للفيديوهات
        existingView.viewDuration = duration;
    }
    
    return this.save();
};

storySchema.methods.addReaction = function(userId, type) {
    // إزالة التفاعل السابق للمستخدم
    this.reactions = this.reactions.filter(
        reaction => !reaction.userId.equals(userId)
    );
    
    // إضافة التفاعل الجديد
    this.reactions.push({
        userId: userId,
        type: type,
        reactedAt: new Date()
    });
    
    this.metrics.reactionCount = this.reactions.length;
    this.calculateEngagementRate();
    
    return this.save();
};

storySchema.methods.removeReaction = function(userId) {
    this.reactions = this.reactions.filter(
        reaction => !reaction.userId.equals(userId)
    );
    
    this.metrics.reactionCount = this.reactions.length;
    this.calculateEngagementRate();
    
    return this.save();
};

storySchema.methods.addReply = function(userId, text, parentReplyId = null) {
    const replyData = {
        userId: userId,
        text: text,
        createdAt: new Date()
    };
    
    if (parentReplyId) {
        // إضافة رد على رد موجود
        const parentReply = this.replies.id(parentReplyId);
        if (parentReply) {
            parentReply.replies.push(replyData);
        } else {
            throw new Error('الرد الأصلي غير موجود');
        }
    } else {
        // إضافة رد جديد
        this.replies.push(replyData);
    }
    
    this.metrics.replyCount += 1;
    this.calculateEngagementRate();
    
    return this.save();
};

storySchema.methods.calculateEngagementRate = function() {
    const totalEngagements = this.metrics.reactionCount + this.metrics.replyCount;
    const totalViews = this.metrics.viewCount || 1; // تجنب القسمة على صفر
    
    this.metrics.engagementRate = (totalEngagements / totalViews) * 100;
    return this.metrics.engagementRate;
};

storySchema.methods.isViewedBy = function(userId) {
    return this.views.some(view => 
        view.userId && view.userId.equals(userId)
    );
};

storySchema.methods.getViewerIds = function() {
    return this.views
        .filter(view => view.userId)
        .map(view => view.userId.toString());
};

storySchema.methods.softDelete = function(userId) {
    this.deleted = {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId
    };
    
    return this.save();
};

// static methods
storySchema.statics.getActiveStories = function(userId = null) {
    const query = {
        expiresAt: { $gt: new Date() },
        'deleted.isDeleted': false
    };
    
    if (userId) {
        query.userId = userId;
    }
    
    return this.find(query)
        .populate('userId', 'fullName avatar university major isOnline')
        .populate('views.userId', 'fullName avatar')
        .populate('reactions.userId', 'fullName avatar')
        .populate('replies.userId', 'fullName avatar')
        .sort({ createdAt: -1 })
        .lean();
};

storySchema.statics.getUserStoryStats = function(userId) {
    return this.aggregate([
        {
            $match: {
                userId: mongoose.Types.ObjectId(userId),
                'deleted.isDeleted': false
            }
        },
        {
            $group: {
                _id: null,
                totalStories: { $sum: 1 },
                activeStories: {
                    $sum: {
                        $cond: [{ $gt: ['$expiresAt', new Date()] }, 1, 0]
                    }
                },
                totalViews: { $sum: '$metrics.viewCount' },
                totalReactions: { $sum: '$metrics.reactionCount' },
                totalReplies: { $sum: '$metrics.replyCount' },
                averageEngagement: { $avg: '$metrics.engagementRate' }
            }
        }
    ]);
};

storySchema.statics.getTrendingStories = function(limit = 20) {
    return this.find({
        expiresAt: { $gt: new Date() },
        'deleted.isDeleted': false,
        'metrics.engagementRate': { $gte: 10 } // نسبة تفاعل 10% على الأقل
    })
    .populate('userId', 'fullName avatar university major')
    .sort({ 'metrics.engagementRate': -1, 'metrics.viewCount': -1 })
    .limit(limit)
    .lean();
};

storySchema.statics.getStoriesByLocation = function(coordinates, maxDistance = 10000) { // 10km
    return this.find({
        expiresAt: { $gt: new Date() },
        'deleted.isDeleted': false,
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: coordinates
                },
                $maxDistance: maxDistance
            }
        }
    })
    .populate('userId', 'fullName avatar university major')
    .sort({ createdAt: -1 })
    .lean();
};

// middleware
storySchema.pre('save', function(next) {
    if (this.isModified('views') || this.isModified('reactions') || this.isModified('replies')) {
        this.calculateEngagementRate();
    }
    next();
});

const Story = mongoose.model('Story', storySchema);

export default Story;
