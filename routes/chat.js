import express from 'express';
import mongoose from 'mongoose';
import { Conversation, Message, Channel } from '../models/chat.js';
import { authenticateToken } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// الحصول على محادثات المستخدم
router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        
        let query = {
            participants: req.user._id,
            isActive: true
        };
        
        if (search) {
            query.$or = [
                { groupName: { $regex: search, $options: 'i' } },
                { 'participants.fullName': { $regex: search, $options: 'i' } }
            ];
        }
        
        const conversations = await Conversation.find(query)
            .populate('participants', 'fullName avatar isOnline lastSeen university')
            .populate('lastMessage')
            .populate('lastMessage.senderId', 'fullName avatar')
            .sort({ lastActivity: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();
        
        // حساب الرسائل غير المقروءة
        for (let conversation of conversations) {
            const unreadCount = await Message.countDocuments({
                conversationId: conversation._id,
                senderId: { $ne: req.user._id },
                'readBy.userId': { $ne: req.user._id },
                'deleted.isDeleted': false
            });
            
            conversation.unreadCount = unreadCount;
        }
        
        const total = await Conversation.countDocuments(query);
        
        res.json({
            success: true,
            conversations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب المحادثات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في جلب المحادثات',
            code: 'CONVERSATIONS_FETCH_ERROR'
        });
    }
});

// إنشاء محادثة جديدة
router.post('/conversations', authenticateToken, async (req, res) => {
    try {
        const { participants, isGroup = false, groupName, groupDescription } = req.body;
        
        if (!participants || !Array.isArray(participants)) {
            return res.status(400).json({
                success: false,
                message: 'يجب تحديد المشاركين في المحادثة',
                code: 'INVALID_PARTICIPANTS'
            });
        }
        
        // إضافة المستخدم الحالي للمشاركين
        const allParticipants = [...new Set([...participants, req.user._id.toString()])];
        
        // التحقق من وجود محادثة موجودة مسبقاً
        if (!isGroup && allParticipants.length === 2) {
            const existingConversation = await Conversation.findOne({
                participants: { $all: allParticipants },
                isGroup: false,
                isActive: true
            });
            
            if (existingConversation) {
                return res.json({
                    success: true,
                    message: 'المحادثة موجودة مسبقاً',
                    conversation: existingConversation,
                    isExisting: true
                });
            }
        }
        
        const conversationData = {
            participants: allParticipants,
            isGroup,
            settings: {
                allowInvites: true,
                approvalRequired: false
            },
            metadata: {
                createdBy: req.user._id
            }
        };
        
        if (isGroup) {
            if (!groupName) {
                return res.status(400).json({
                    success: false,
                    message: 'اسم المجموعة مطلوب',
                    code: 'GROUP_NAME_REQUIRED'
                });
            }
            
            conversationData.groupName = groupName;
            conversationData.groupDescription = groupDescription;
            conversationData.groupAdmins = [req.user._id];
        }
        
        const conversation = new Conversation(conversationData);
        await conversation.save();
        
        await conversation.populate('participants', 'fullName avatar isOnline lastSeen university');
        
        res.status(201).json({
            success: true,
            message: isGroup ? 'تم إنشاء المجموعة بنجاح' : 'تم إنشاء المحادثة بنجاح',
            conversation
        });
        
    } catch (error) {
        console.error('خطأ في إنشاء المحادثة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في إنشاء المحادثة',
            code: 'CONVERSATION_CREATE_ERROR'
        });
    }
});

// الحصول على رسائل المحادثة
router.get('/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { page = 1, limit = 50, before } = req.query;
        
        // التحقق من أن المستخدم مشارك في المحادثة
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: req.user._id,
            isActive: true
        });
        
        if (!conversation) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالوصول لهذه المحادثة',
                code: 'CONVERSATION_ACCESS_DENIED'
            });
        }
        
        let query = { 
            conversationId,
            'deleted.isDeleted': false 
        };
        
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }
        
        const messages = await Message.find(query)
            .populate('senderId', 'fullName avatar isOnline lastSeen')
            .populate('replyTo', 'content senderId messageType')
            .populate('replyTo.senderId', 'fullName avatar')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();
        
        // تحديث عدد الرسائل غير المقروءة
        await conversation.resetUnreadCount(req.user._id);
        
        res.json({
            success: true,
            messages: messages.reverse(), // عكس الترتيب لعرض الأقدم أولاً
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                hasMore: messages.length === limit
            }
        });
        
    } catch (error) {
        console.error('خطأ في جلب الرسائل:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في جلب الرسائل',
            code: 'MESSAGES_FETCH_ERROR'
        });
    }
});

// إرسال رسالة جديدة
router.post('/conversations/:conversationId/messages', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content, messageType = 'text', replyTo, forwardedFrom } = req.body;
        
        // التحقق من أن المستخدم مشارك في المحادثة
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: req.user._id,
            isActive: true
        });
        
        if (!conversation) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بإرسال رسالة في هذه المحادثة',
                code: 'MESSAGE_SEND_DENIED'
            });
        }
        
        // التحقق من وضع البطء
        if (conversation.settings.slowMode) {
            const lastMessage = await Message.findOne({
                conversationId,
                senderId: req.user._id
            }).sort({ createdAt: -1 });
            
            if (lastMessage) {
                const timeDiff = Date.now() - lastMessage.createdAt.getTime();
                if (timeDiff < conversation.settings.slowModeDelay * 1000) {
                    return res.status(429).json({
                        success: false,
                        message: `يرجى الانتظار ${conversation.settings.slowModeDelay} ثواني قبل إرسال رسالة أخرى`,
                        code: 'SLOW_MODE_ACTIVE'
                    });
                }
            }
        }
        
        const messageData = {
            conversationId,
            senderId: req.user._id,
            content,
            messageType
        };
        
        // معالجة الرد على رسالة
        if (replyTo) {
            const repliedMessage = await Message.findById(replyTo);
            if (repliedMessage && repliedMessage.conversationId.toString() === conversationId) {
                messageData.replyTo = replyTo;
            }
        }
        
        // معالجة إعادة التوجيه
        if (forwardedFrom) {
            messageData.forwardedFrom = forwardedFrom;
        }
        
        // معالجة الملفات
        if (req.file) {
            messageData.fileUrl = `/uploads/chat/${req.file.filename}`;
            messageData.fileName = req.file.originalname;
            messageData.fileSize = req.file.size;
            messageData.fileMimeType = req.file.mimetype;
            
            if (req.file.mimetype.startsWith('image/') || req.file.mimetype.startsWith('video/')) {
                messageData.thumbnailUrl = `/uploads/chat/thumbnails/${req.file.filename}`;
            }
        }
        
        const message = new Message(messageData);
        await message.save();
        
        // تحديث المحادثة
        conversation.lastMessage = message._id;
        conversation.lastActivity = new Date();
        
        // زيادة عدد الرسائل غير المقروءة للمشاركين الآخرين
        for (const participant of conversation.participants) {
            if (!participant.equals(req.user._id)) {
                await conversation.incrementUnreadCount(participant);
            }
        }
        
        await conversation.save();
        
        // تحديث إحصائيات المستخدم
        await mongoose.model('User').findByIdAndUpdate(req.user._id, {
            $inc: { 'stats.messagesSent': 1 }
        });
        
        await message.populate('senderId', 'fullName avatar isOnline lastSeen');
        await message.populate('replyTo', 'content senderId messageType');
        await message.populate('replyTo.senderId', 'fullName avatar');
        
        res.status(201).json({
            success: true,
            message: 'تم إرسال الرسالة بنجاح',
            message: message
        });
        
    } catch (error) {
        console.error('خطأ في إرسال الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في إرسال الرسالة',
            code: 'MESSAGE_SEND_ERROR'
        });
    }
});

// تفاعل مع رسالة
router.post('/messages/:messageId/reaction', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { emoji } = req.body;
        
        if (!emoji) {
            return res.status(400).json({
                success: false,
                message: 'الرمز التفاعلي مطلوب',
                code: 'EMOJI_REQUIRED'
            });
        }
        
        const message = await Message.findById(messageId);
        
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'الرسالة غير موجودة',
                code: 'MESSAGE_NOT_FOUND'
            });
        }
        
        // التحقق من أن المستخدم مشارك في المحادثة
        const conversation = await Conversation.findOne({
            _id: message.conversationId,
            participants: req.user._id
        });
        
        if (!conversation) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالتفاعل مع هذه الرسالة',
                code: 'REACTION_DENIED'
            });
        }
        
        await message.addReaction(req.user._id, emoji);
        
        res.json({
            success: true,
            message: 'تم إضافة التفاعل بنجاح',
            reactions: message.reactions
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

//标记 الرسالة كمقروءة
router.post('/messages/:messageId/read', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        
        const message = await Message.findById(messageId);
        
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'الرسالة غير موجودة',
                code: 'MESSAGE_NOT_FOUND'
            });
        }
        
        // التحقق من أن المستخدم مشارك في المحادثة
        const conversation = await Conversation.findOne({
            _id: message.conversationId,
            participants: req.user._id
        });
        
        if (!conversation) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بتحديد حالة القراءة',
                code: 'READ_STATUS_DENIED'
            });
        }
        
        await message.markAsRead(req.user._id);
        
        res.json({
            success: true,
            message: 'تم تحديث حالة القراءة'
        });
        
    } catch (error) {
        console.error('خطأ في تحديث حالة القراءة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في تحديث حالة القراءة',
            code: 'READ_STATUS_ERROR'
        });
    }
});

// تحرير رسالة
router.put('/messages/:messageId', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({
                success: false,
                message: 'المحتوى مطلوب',
                code: 'CONTENT_REQUIRED'
            });
        }
        
        const message = await Message.findById(messageId);
        
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'الرسالة غير موجودة',
                code: 'MESSAGE_NOT_FOUND'
            });
        }
        
        // التحقق من أن المستخدم هو مرسل الرسالة
        if (!message.senderId.equals(req.user._id)) {
            return res.status(403).json({
                success: false,
                message: 'يمكنك فقط تحرير رسائلك الخاصة',
                code: 'EDIT_DENIED'
            });
        }
        
        // التحقق من أن الرسالة لم يتم حذفها
        if (message.deleted.isDeleted) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن تحرير رسالة محذوفة',
                code: 'MESSAGE_DELETED'
            });
        }
        
        await message.editContent(content);
        
        res.json({
            success: true,
            message: 'تم تحرير الرسالة بنجاح',
            message: message
        });
        
    } catch (error) {
        console.error('خطأ في تحرير الرسالة:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في تحرير الرسالة',
            code: 'MESSAGE_EDIT_ERROR'
        });
    }
});

// حذف رسالة
router.delete('/messages/:messageId', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        
        const message = await Message.findById(messageId);
        
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'الرسالة غير موجودة',
                code: 'MESSAGE_NOT_FOUND'
            });
        }
        
        // التحقق من الصلاحيات (المرسل أو مشرف في المجموعة)
        const conversation = await Conversation.findOne({
            _id: message.conversationId,
            participants: req.user._id
        });
        
        if (!conversation) {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بحذف هذه الرسالة',
                code: 'DELETE_DENIED'
            });
        }
        
        const canDelete = message.senderId.equals(req.user._id) || 
                         (conversation.isGroup && conversation.groupAdmins.includes(req.user._id));
        
        if (!canDelete) {
            return res.status(403
