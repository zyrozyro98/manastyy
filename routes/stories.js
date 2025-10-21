import express from 'express';
import mongoose from 'mongoose';
import { Story } from '../models/story.js';
import { authenticateToken } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// الحصول على القصص النشطة
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, type = 'all' } = req.query;
        
        let query = { 
            expiresAt: { $gt: new Date() },
            'deleted.isDeleted': false
        };
        
        if (type === 'following') {
            // الحصول على قصص المستخدمين المتابَعين
            // (يمكن تطوير نظام المتابعة هنا)
            query.userId = { $in: [] }; // مؤقت
        } else if (type === 'popular') {
            query['metrics.viewCount'] = { $gte: 10 };
        }
        
        const stories = await Story.find(query)
            .populate('userId', 'fullName avatar university major isOnline')
            .populate('views.userId', 'fullName avatar')
            .populate('reactions.userId', 'fullName avatar')
            .populate('replies.userId', 'fullName avatar')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();
        
        // تجميع القصص حسب المستخدم
        const storiesByUser = {};
        stories.forEach(story => {
            const userId = story.userId._id.toString();
            if (!storiesByUser[userId]) {
                storiesByUser[userId] = {
                    user: story.userId,
                    stories: []
                };
            }
            storiesByUser[userId].stories.push(story);
        });
        
        const result = Object.values(storiesByUser);
        
        const total = await Story.countDocuments(query);
        
        res.json({
            success: true,
            stories: result,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب القصص:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في جلب القصص',
            code: 'STORIES_FETCH_ERROR'
        });
    }
});

// إنشاء قصة جديدة
router.post('/', authenticateToken, upload.single('story'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'الملف مطلوب',
                code: 'FILE_REQUIRED'
            });
        }

        const { 
            caption, 
            allowReplies = true, 
            allowSharing = true, 
            location,
            tags 
        } = req.body;

        // تحديد نوع الوسائط
        const isVideo = req.file.mimetype.startsWith('video/');
        const mediaType = isVideo ? 'video' : 'image';
        
        // حساب وقت الانتهاء (24 ساعة)
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const storyData = {
            userId: req.user._id,
            mediaUrl: `/uploads/stories/${req.file.filename}`,
            mediaType,
            caption,
            allowReplies: allowReplies === 'true',
            allowSharing: allowSharing === 'true',
            expiresAt
        };

        // معالجة الموقع
        if (location) {
            try {
                const locationData = JSON.parse(location);
                storyData.location = {
                    type: 'Point',
                    coordinates: [locationData.longitude, locationData.latitude]
                };
            } catch (error) {
                console.error('خطأ في معالجة الموقع:', error);
            }
        }

        // معالجة الوسوم
        if (tags) {
            try {
                storyData.tags = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
            } catch (error) {
                console.error('خطأ في معالجة الوسوم:', error);
            }
        }

        // إنشاء ثumbnail للفيديوهات
        if (isVideo) {
            // (يمكن إضافة معالجة لإنشاء ثumbnail للفيديوهات هنا)
            storyData.thumbnailUrl = `/uploads/stories/thumbnails/${req.file.filename}.jpg`;
        }

        const story = new Story(storyData);
        await story.save();

        // تحديث إحصائيات المستخدم
        await mongoose.model('User').findByIdAndUpdate(req.user._id, {
            $inc: { 'stats.storiesPosted': 1 }
        });

        await story.populate('userId', 'fullName avatar university major');

        res.status(201).json({
            success: true,
            message: 'تم نشر القصة بنجاح',
            story
        });

    } catch (error) {
        console.error('خطأ في نشر القصة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في نشر القصة',
            code: 'STORY_CREATE_ERROR'
        });
    }
});

// الحصول على قصة محددة
router.get('/:storyId', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        
        const story = await Story.findOne({
            _id: storyId,
            expiresAt: { $gt: new Date() },
            'deleted.isDeleted': false
        })
        .populate('userId', 'fullName avatar university major isOnline')
        .populate('views.userId', 'fullName avatar')
        .populate('reactions.userId', 'fullName avatar')
        .populate('replies.userId', 'fullName avatar')
        .populate('replies.replies.userId', 'fullName avatar');
        
        if (!story) {
            return res.status(404).json({
                success: false,
                message: 'القصة غير موجودة أو منتهية الصلاحية',
                code: 'STORY_NOT_FOUND'
            });
        }
        
        // تسجيل المشاهدة إذا لم يكن المستخدم هو صاحب القصة
        if (!story.userId._id.equals(req.user._id)) {
            const alreadyViewed = story.views.some(view => 
                view.userId && view.userId._id.equals(req.user._id)
            );
            
            if (!alreadyViewed) {
                story.views.push({
                    userId: req.user._id,
                    viewedAt: new Date()
                });
                
                story.metrics.viewCount += 1;
                await story.save();
            }
        }
        
        res.json({
            success: true,
            story
        });
        
    } catch (error) {
        console.error('خطأ في جلب القصة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في جلب القصة',
            code: 'STORY_FETCH_ERROR'
        });
    }
});

// إضافة تفاعل للقصة
router.post('/:storyId/reaction', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const { type } = req.body;
        
        if (!type || !['like', 'love', 'laugh', 'wow', 'sad', 'angry'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'نوع التفاعل غير صالح',
                code: 'INVALID_REACTION_TYPE'
            });
        }
        
        const story = await Story.findOne({
            _id: storyId,
            expiresAt: { $gt: new Date() },
            'deleted.isDeleted': false
        });
        
        if (!story) {
            return res.status(404).json({
                success: false,
                message: 'القصة غير موجودة أو منتهية الصلاحية',
                code: 'STORY_NOT_FOUND'
            });
        }
        
        // إزالة التفاعل السابق للمستخدم
        story.reactions = story.reactions.filter(
            reaction => !reaction.userId.equals(req.user._id)
        );
        
        // إضافة التفاعل الجديد
        story.reactions.push({
            userId: req.user._id,
            type,
            reactedAt: new Date()
        });
        
        story.metrics.reactionCount = story.reactions.length;
        await story.save();
        
        res.json({
            success: true,
            message: 'تم إضافة التفاعل بنجاح',
            reactions: story.reactions
        });
        
    } catch (error) {
        console.error('خطأ في إضافة التفاعل:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في إضافة التفاعل',
            code: 'REACTION_ERROR'
        });
    }
});

// إضافة رد على القصة
router.post('/:storyId/reply', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        const { text, parentReplyId } = req.body;
        
        if (!text || text.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'نص الرد مطلوب',
                code: 'REPLY_TEXT_REQUIRED'
            });
        }
        
        const story = await Story.findOne({
            _id: storyId,
            expiresAt: { $gt: new Date() },
            'deleted.isDeleted': false
        });
        
        if (!story) {
            return res.status(404).json({
                success: false,
                message: 'القصة غير موجودة أو منتهية الصلاحية',
                code: 'STORY_NOT_FOUND'
            });
        }
        
        if (!story.allowReplies) {
            return res.status(400).json({
                success: false,
                message: 'لا يسمح بإضافة ردود على هذه القصة',
                code: 'REPLIES_NOT_ALLOWED'
            });
        }
        
        const replyData = {
            userId: req.user._id,
            text: text.trim(),
            createdAt: new Date()
        };
        
        if (parentReplyId) {
            // إضافة رد على رد موجود
            const parentReply = story.replies.id(parentReplyId);
            if (parentReply) {
                parentReply.replies.push(replyData);
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'الرد الأصلي غير موجود',
                    code: 'PARENT_REPLY_NOT_FOUND'
                });
            }
        } else {
            // إضافة رد جديد
            story.replies.push(replyData);
        }
        
        story.metrics.replyCount += 1;
        await story.save();
        
        await story.populate('replies.userId', 'fullName avatar');
        await story.populate('replies.replies.userId', 'fullName avatar');
        
        res.json({
            success: true,
            message: 'تم إضافة الرد بنجاح',
            replies: story.replies
        });
        
    } catch (error) {
        console.error('خطأ في إضافة الرد:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في إضافة الرد',
            code: 'REPLY_ERROR'
        });
    }
});

// الحصول على إحصائيات القصص
router.get('/user/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;
        
        const stats = await Story.aggregate([
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
                    totalShares: { $sum: '$metrics.shareCount' }
                }
            }
        ]);
        
        const result = stats[0] || {
            totalStories: 0,
            activeStories: 0,
            totalViews: 0,
            totalReactions: 0,
            totalReplies: 0,
            totalShares: 0
        };
        
        res.json({
            success: true,
            stats: result
        });
        
    } catch (error) {
        console.error('خطأ في جلب إحصائيات القصص:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في جلب إحصائيات القصص',
            code: 'STORIES_STATS_ERROR'
        });
    }
});

// حذف قصة
router.delete('/:storyId', authenticateToken, async (req, res) => {
    try {
        const { storyId } = req.params;
        
        const story = await Story.findOne({
            _id: storyId,
            userId: req.user._id
        });
        
        if (!story) {
            return res.status(404).json({
                success: false,
                message: 'القصة غير موجودة أو لا تملك صلاحية حذفها',
                code: 'STORY_NOT_FOUND'
            });
        }
        
        story.deleted = {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: req.user._id
        };
        
        await story.save();
        
        res.json({
            success: true,
            message: 'تم حذف القصة بنجاح'
        });
        
    } catch (error) {
        console.error('خطأ في حذف القصة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في حذف القصة',
            code: 'STORY_DELETE_ERROR'
        });
    }
});

// الحصول على قصص مستخدم محدد
router.get('/user/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const stories = await Story.find({
            userId,
            expiresAt: { $gt: new Date() },
            'deleted.isDeleted': false
        })
        .populate('userId', 'fullName avatar university major isOnline')
        .sort({ createdAt: -1 })
        .lean();
        
        res.json({
            success: true,
            stories
        });
        
    } catch (error) {
        console.error('خطأ في جلب قصص المستخدم:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في جلب قصص المستخدم',
            code: 'USER_STORIES_ERROR'
        });
    }
});

export default router;
