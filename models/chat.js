import mongoose from 'mongoose';

// نموذج المحادثة
const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    isGroup: {
        type: Boolean,
        default: false
    },
    groupName: {
        type: String,
        trim: true,
        maxlength: 100
    },
    groupAvatar: {
        type: String
    },
    groupDescription: {
        type: String,
        maxlength: 500
    },
    groupAdmins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    unreadCount: {
        type: Map,
        of: Number,
        default: {}
    },
    settings: {
        allowInvites: {
            type: Boolean,
            default: true
        },
        approvalRequired: {
            type: Boolean,
            default: false
        },
        slowMode: {
            type: Boolean,
            default: false
        },
        slowModeDelay: {
            type: Number,
            default: 0
        },
        allowFiles: {
            type: Boolean,
            default: true
        },
        allowVoice: {
            type: Boolean,
            default: true
        },
        maxFileSize: {
            type: Number,
            default: 50 * 1024 * 1024 // 50MB
        }
    },
    metadata: {
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        pinnedMessages: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message'
        }],
        theme: {
            type: String,
            default: 'default'
        },
        background: {
            type: String,
            default: 'default'
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastActivity: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// فهارس للمحادثات
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastActivity: -1 });
conversationSchema.index({ isGroup: 1, isActive: 1 });

// virtuals
conversationSchema.virtual('messages', {
    ref: 'Message',
    localField: '_id',
    foreignField: 'conversationId'
});

conversationSchema.virtual('participantCount').get(function() {
    return this.participants.length;
});

// methods
conversationSchema.methods.updateLastActivity = function() {
    this.lastActivity = new Date();
    return this.save();
};

conversationSchema.methods.addParticipant = function(userId) {
    if (!this.participants.includes(userId)) {
        this.participants.push(userId);
    }
    return this.save();
};

conversationSchema.methods.removeParticipant = function(userId) {
    this.participants = this.participants.filter(pid => !pid.equals(userId));
    
    // إزالة من المشرفين أيضاً
    this.groupAdmins = this.groupAdmins.filter(pid => !pid.equals(userId));
    
    return this.save();
};

conversationSchema.methods.isParticipant = function(userId) {
    return this.participants.some(pid => pid.equals(userId));
};

conversationSchema.methods.isAdmin = function(userId) {
    return this.groupAdmins.some(pid => pid.equals(userId));
};

conversationSchema.methods.getUnreadCount = function(userId) {
    return this.unreadCount.get(userId.toString()) || 0;
};

conversationSchema.methods.incrementUnreadCount = function(userId) {
    const currentCount = this.getUnreadCount(userId);
    this.unreadCount.set(userId.toString(), currentCount + 1);
    return this.save();
};

conversationSchema.methods.resetUnreadCount = function(userId) {
    this.unreadCount.set(userId.toString(), 0);
    return this.save();
};

// نموذج الرسالة
const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    content: {
        type: String,
        required: function() {
            return this.messageType === 'text';
        },
        trim: true,
        maxlength: 5000
    },
    messageType: {
        type: String,
        enum: ['text', 'image', 'video', 'file', 'voice', 'location', 'system'],
        default: 'text',
        index: true
    },
    fileUrl: {
        type: String
    },
    fileSize: {
        type: Number
    },
    fileName: {
        type: String
    },
    fileMimeType: {
        type: String
    },
    duration: {
        type: Number // للملفات الصوتية
    },
    thumbnailUrl: {
        type: String // للفيديوهات والصور
    },
    location: {
        latitude: { type: Number },
        longitude: { type: Number },
        address: { type: String },
        name: { type: String }
    },
    readBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
    reactions: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        emoji: {
            type: String,
            required: true
        },
        reactedAt: {
            type: Date,
            default: Date.now
        }
    }],
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    forwardedFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    edited: {
        isEdited: {
            type: Boolean,
            default: false
        },
        editedAt: Date,
        previousContent: [String]
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
        isPinned: {
            type: Boolean,
            default: false
        },
        pinnedAt: Date,
        pinnedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        mentions: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        hashtags: [String],
        links: [{
            url: String,
            title: String,
            description: String,
            image: String
        }]
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// فهارس للرسائل
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ 'readBy.userId': 1 });
messageSchema.index({ 'reactions.userId': 1 });

// virtuals
messageSchema.virtual('sender', {
    ref: 'User',
    localField: 'senderId',
    foreignField: '_id',
    justOne: true
});

messageSchema.virtual('conversation', {
    ref: 'Conversation',
    localField: 'conversationId',
    foreignField: '_id',
    justOne: true
});

messageSchema.virtual('replyToMessage', {
    ref: 'Message',
    localField: 'replyTo',
    foreignField: '_id',
    justOne: true
});

// methods
messageSchema.methods.markAsRead = function(userId) {
    const alreadyRead = this.readBy.some(read => read.userId.equals(userId));
    if (!alreadyRead) {
        this.readBy.push({
            userId: userId,
            readAt: new Date()
        });
    }
    return this.save();
};

messageSchema.methods.isReadBy = function(userId) {
    return this.readBy.some(read => read.userId.equals(userId));
};

messageSchema.methods.addReaction = function(userId, emoji) {
    // إزالة التفاعل السابق لنفس المستخدم
    this.reactions = this.reactions.filter(reaction => !reaction.userId.equals(userId));
    
    // إضافة التفاعل الجديد
    this.reactions.push({
        userId: userId,
        emoji: emoji,
        reactedAt: new Date()
    });
    
    return this.save();
};

messageSchema.methods.removeReaction = function(userId) {
    this.reactions = this.reactions.filter(reaction => !reaction.userId.equals(userId));
    return this.save();
};

messageSchema.methods.getReactionCount = function(emoji) {
    return this.reactions.filter(reaction => reaction.emoji === emoji).length;
};

messageSchema.methods.editContent = function(newContent) {
    if (!this.edited.previousContent) {
        this.edited.previousContent = [];
    }
    
    // حفظ المحتوى السابق
    this.edited.previousContent.push(this.content);
    
    // تحديث المحتوى
    this.content = newContent;
    this.edited.isEdited = true;
    this.edited.editedAt = new Date();
    
    return this.save();
};

messageSchema.methods.softDelete = function(userId) {
    this.deleted = {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId
    };
    
    // إخفاء المحتوى الحساس
    this.content = 'تم حذف هذه الرسالة';
    this.fileUrl = null;
    this.thumbnailUrl = null;
    
    return this.save();
};

messageSchema.methods.pinMessage = function(userId) {
    this.metadata.isPinned = true;
    this.metadata.pinnedAt = new Date();
    this.metadata.pinnedBy = userId;
    return this.save();
};

messageSchema.methods.unpinMessage = function() {
    this.metadata.isPinned = false;
    this.metadata.pinnedAt = null;
    this.metadata.pinnedBy = null;
    return this.save();
};

// static methods
messageSchema.statics.getConversationMessages = function(conversationId, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    
    return this.find({ conversationId })
        .populate('senderId', 'fullName avatar isOnline lastSeen')
        .populate('replyTo', 'content senderId messageType')
        .populate('replyTo.senderId', 'fullName avatar')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();
};

messageSchema.statics.getUnreadMessagesCount = function(conversationId, userId) {
    return this.countDocuments({
        conversationId,
        senderId: { $ne: userId },
        'readBy.userId': { $ne: userId },
        'deleted.isDeleted': false
    });
};

// نموذج الدردشة الجماعية (القنوات)
const channelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
        index: true
    },
    description: {
        type: String,
        maxlength: 1000
    },
    type: {
        type: String,
        enum: ['channel', 'group', 'broadcast', 'course', 'class'],
        required: true,
        index: true
    },
    avatar: {
        type: String
    },
    banner: {
        type: String
    },
    isPublic: {
        type: Boolean,
        default: true,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    creatorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    members: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        },
        role: {
            type: String,
            enum: ['member', 'moderator', 'admin'],
            default: 'member'
        },
        notifications: {
            type: String,
            enum: ['all', 'mentions', 'none'],
            default: 'all'
        }
    }],
    admins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    moderators: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    settings: {
        allowMessages: {
            type: Boolean,
            default: true
        },
        allowFiles: {
            type: Boolean,
            default: true
        },
        allowVoice: {
            type: Boolean,
            default: true
        },
        approvalRequired: {
            type: Boolean,
            default: false
        },
        membersCanInvite: {
            type: Boolean,
            default: true
        },
        membersCanCreatePolls: {
            type: Boolean,
            default: true
        },
        slowMode: {
            type: Boolean,
            default: false
        },
        slowModeDelay: {
            type: Number,
            default: 0
        },
        maxMembers: {
            type: Number,
            default: 1000
        },
        maxFileSize: {
            type: Number,
            default: 50 * 1024 * 1024 // 50MB
        }
    },
    topics: [{
        type: String,
        trim: true,
        maxlength: 50
    }],
    rules: [{
        type: String,
        maxlength: 500
    }],
    stats: {
        memberCount: {
            type: Number,
            default: 0
        },
        messageCount: {
            type: Number,
            default: 0
        },
        dailyActiveUsers: {
            type: Number,
            default: 0
        },
        totalViews: {
            type: Number,
            default: 0
        }
    },
    metadata: {
        category: {
            type: String,
            index: true
        },
        level: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced'],
            index: true
        },
        tags: [{
            type: String,
            index: true
        }],
        language: {
            type: String,
            default: 'ar'
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        featured: {
            type: Boolean,
            default: false
        }
    },
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    lastActivity: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// فهارس للقنوات
channelSchema.index({ name: 'text', description: 'text' });
channelSchema.index({ type: 1, isPublic: 1, isActive: 1 });
channelSchema.index({ 'metadata.tags': 1 });
channelSchema.index({ 'metadata.category': 1 });
channelSchema.index({ lastActivity: -1 });

// virtuals
channelSchema.virtual('memberList', {
    ref: 'User',
    localField: 'members.userId',
    foreignField: '_id'
});

channelSchema.virtual('adminList', {
    ref: 'User',
    localField: 'admins',
    foreignField: '_id'
});

channelSchema.virtual('messages', {
    ref: 'Message',
    localField: '_id',
    foreignField: 'conversationId'
});

// methods
channelSchema.methods.addMember = function(userId, role = 'member') {
    const existingMember = this.members.find(m => m.userId.equals(userId));
    
    if (!existingMember) {
        this.members.push({
            userId: userId,
            role: role,
            joinedAt: new Date()
        });
        
        this.stats.memberCount = this.members.length;
    }
    
    return this.save();
};

channelSchema.methods.removeMember = function(userId) {
    this.members = this.members.filter(m => !m.userId.equals(userId));
    this.admins = this.admins.filter(adminId => !adminId.equals(userId));
    this.moderators = this.moderators.filter(modId => !modId.equals(userId));
    
    this.stats.memberCount = this.members.length;
    
    return this.save();
};

channelSchema.methods.isMember = function(userId) {
    return this.members.some(m => m.userId.equals(userId));
};

channelSchema.methods.isAdmin = function(userId) {
    return this.admins.some(adminId => adminId.equals(userId));
};

channelSchema.methods.isModerator = function(userId) {
    return this.moderators.some(modId => modId.equals(userId));
};

channelSchema.methods.getMemberRole = function(userId) {
    const member = this.members.find(m => m.userId.equals(userId));
    return member ? member.role : null;
};

channelSchema.methods.promoteToAdmin = function(userId) {
    if (!this.isAdmin(userId)) {
        this.admins.push(userId);
        
        // تحديث دور العضو
        const member = this.members.find(m => m.userId.equals(userId));
        if (member) {
            member.role = 'admin';
        }
    }
    
    return this.save();
};

channelSchema.methods.demoteFromAdmin = function(userId) {
    this.admins = this.admins.filter(adminId => !adminId.equals(userId));
    
    // تحديث دور العضو
    const member = this.members.find(m => m.userId.equals(userId));
    if (member) {
        member.role = 'member';
    }
    
    return this.save();
};

channelSchema.methods.updateLastActivity = function() {
    this.lastActivity = new Date();
    return this.save();
};

channelSchema.methods.incrementMessageCount = function() {
    this.stats.messageCount += 1;
    return this.save();
};

// static methods
channelSchema.statics.searchChannels = function(query, filters = {}) {
    const searchQuery = {
        isActive: true,
        ...filters
    };
    
    if (query) {
        searchQuery.$text = { $search: query };
    }
    
    return this.find(searchQuery)
        .populate('creatorId', 'fullName avatar')
        .populate('lastMessage')
        .sort({ 'stats.memberCount': -1, lastActivity: -1 })
        .limit(50)
        .lean();
};

channelSchema.statics.getUserChannels = function(userId) {
    return this.find({
        'members.userId': userId,
        isActive: true
    })
    .populate('creatorId', 'fullName avatar')
    .populate('lastMessage')
    .sort({ lastActivity: -1 })
    .lean();
};

// إنشاء النماذج
const Conversation = mongoose.model('Conversation', conversationSchema);
const Message = mongoose.model('Message', messageSchema);
const Channel = mongoose.model('Channel', channelSchema);

export { Conversation, Message, Channel };
