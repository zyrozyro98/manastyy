import { Server } from 'socket.io';
import { Conversation, Message } from '../models/chat.js';
import { Story } from '../models/story.js';

// تخزين المستخدمين المتصلين
const connectedUsers = new Map();
const userSockets = new Map();

export function initializeChatSocket(io) {
    
    io.on('connection', (socket) => {
        console.log('👤 مستخدم متصل عبر Socket:', socket.id);

        // حدث اتصال المستخدم
        socket.on('user_connected', async (userData) => {
            try {
                const { userId, userInfo } = userData;
                
                connectedUsers.set(userId, socket.id);
                userSockets.set(socket.id, userId);
                
                socket.userId = userId;
                
                console.log(`✅ المستخدم ${userId} متصل الآن`);
                
                // تحديث حالة المستخدم إلى متصل
                // await User.findByIdAndUpdate(userId, { isOnline: true });
                
                // إعلام المستخدمين الآخرين
                socket.broadcast.emit('user_online', {
                    userId,
                    userInfo
                });
                
            } catch (error) {
                console.error('خطأ في اتصال المستخدم:', error);
            }
        });

        // الانضمام إلى محادثة
        socket.on('join_conversation', (conversationId) => {
            socket.join(`conversation_${conversationId}`);
            console.log(`💬 المستخدم انضم للمحادثة: ${conversationId}`);
        });

        // مغادرة محادثة
        socket.on('leave_conversation', (conversationId) => {
            socket.leave(`conversation_${conversationId}`);
            console.log(`🚪 المستخدم غادر المحادثة: ${conversationId}`);
        });

        // الانضمام إلى قناة
        socket.on('join_channel', (channelId) => {
            socket.join(`channel_${channelId}`);
            console.log(`📢 المستخدم انضم للقناة: ${channelId}`);
        });

        // إرسال رسالة
        socket.on('send_message', async (data) => {
            try {
                const { conversationId, content, messageType = 'text', replyTo, fileUrl } = data;

                // التحقق من أن المستخدم مشارك في المحادثة
                const conversation = await Conversation.findOne({
                    _id: conversationId,
                    participants: socket.userId
                });

                if (!conversation) {
                    socket.emit('error', { 
                        message: 'غير مصرح لك بإرسال رسالة في هذه المحادثة',
                        code: 'UNAUTHORIZED_CONVERSATION'
                    });
                    return;
                }

                // إنشاء الرسالة
                const message = new Message({
                    conversationId,
                    senderId: socket.userId,
                    content,
                    messageType,
                    fileUrl,
                    replyTo
                });

                await message.save();

                // تحديث المحادثة
                conversation.lastMessage = message._id;
                conversation.lastActivity = new Date();
                
                // تحديث عدد الرسائل غير المقروءة للمشاركين الآخرين
                conversation.participants.forEach(participantId => {
                    if (participantId.toString() !== socket.userId) {
                        const currentCount = conversation.unreadCount.get(participantId.toString()) || 0;
                        conversation.unreadCount.set(participantId.toString(), currentCount + 1);
                    }
                });

                await conversation.save();

                // إرسال الرسالة للمشاركين
                const populatedMessage = await message.populate('senderId', 'fullName avatar isOnline');
                const messageData = {
                    message: populatedMessage.toObject(),
                    conversationId
                };
                
                io.to(`conversation_${conversationId}`).emit('new_message', messageData);

            } catch (error) {
                console.error('خطأ في إرسال الرسالة:', error);
                socket.emit('error', { 
                    message: 'حدث خطأ في إرسال الرسالة',
                    code: 'MESSAGE_SEND_ERROR'
                });
            }
        });

        // تفاعل مع رسالة
        socket.on('message_reaction', async (data) => {
            try {
                const { messageId, emoji } = data;
                
                const message = await Message.findById(messageId);
                if (!message) {
                    socket.emit('error', { message: 'الرسالة غير موجودة' });
                    return;
                }

                // التحقق من أن المستخدم مشارك في المحادثة
                const conversation = await Conversation.findOne({
                    _id: message.conversationId,
                    participants: socket.userId
                });

                if (!conversation) {
                    socket.emit('error', { 
                        message: 'غير مصرح لك بالتفاعل مع هذه الرسالة',
                        code: 'UNAUTHORIZED_REACTION'
                    });
                    return;
                }

                await message.addReaction(socket.userId, emoji);

                // بث تحديث التفاعل
                io.to(`conversation_${message.conversationId}`).emit('message_reaction_updated', {
                    messageId,
                    reactions: message.reactions
                });

            } catch (error) {
                console.error('خطأ في تفاعل الرسالة:', error);
            }
        });

        // تحديث حالة القراءة
        socket.on('message_read', async (data) => {
            try {
                const { conversationId, messageId } = data;

                const conversation = await Conversation.findOne({
                    _id: conversationId,
                    participants: socket.userId
                });

                if (conversation) {
                    // تحديث الرسالة
                    await Message.findByIdAndUpdate(messageId, {
                        $addToSet: { 
                            readBy: { 
                                userId: socket.userId,
                                readAt: new Date()
                            }
                        }
                    });

                    // تحديث عدد الرسائل غير المقروءة
                    conversation.unreadCount.set(socket.userId.toString(), 0);
                    await conversation.save();

                    // إعلام المشاركين الآخرين
                    socket.to(`conversation_${conversationId}`).emit('message_read_update', {
                        messageId,
                        readBy: socket.userId
                    });
                }

            } catch (error) {
                console.error('خطأ في تحديث حالة القراءة:', error);
            }
        });

        // مؤشر الكتابة
        socket.on('typing_start', (data) => {
            const { conversationId } = data;
            socket.to(`conversation_${conversationId}`).emit('user_typing', {
                userId: socket.userId,
                conversationId,
                isTyping: true
            });
        });

        socket.on('typing_stop', (data) => {
            const { conversationId } = data;
            socket.to(`conversation_${conversationId}`).emit('user_typing', {
                userId: socket.userId,
                conversationId,
                isTyping: false
            });
        });

        // أحداث القصص
        socket.on('story_view', async (data) => {
            try {
                const { storyId, viewDuration = 0 } = data;
                
                const story = await Story.findById(storyId);
                if (story && !story.userId.equals(socket.userId)) {
                    await story.addView(socket.userId, viewDuration);
                    
                    // إعلام صاحب القصة بمشاهدة جديدة
                    const ownerSocketId = connectedUsers.get(story.userId.toString());
                    if (ownerSocketId) {
                        io.to(ownerSocketId).emit('story_viewed', {
                            storyId,
                            viewerId: socket.userId,
                            viewDuration
                        });
                    }
                }
            } catch (error) {
                console.error('خطأ في تسجيل مشاهدة القصة:', error);
            }
        });

        socket.on('story_reaction', async (data) => {
            try {
                const { storyId, reactionType } = data;
                
                const story = await Story.findById(storyId);
                if (story) {
                    await story.addReaction(socket.userId, reactionType);
                    
                    // إعلام صاحب القصة بالتفاعل الجديد
                    const ownerSocketId = connectedUsers.get(story.userId.toString());
                    if (ownerSocketId) {
                        io.to(ownerSocketId).emit('story_reacted', {
                            storyId,
                            reactorId: socket.userId,
                            reactionType
                        });
                    }
                }
            } catch (error) {
                console.error('خطأ في تفاعل القصة:', error);
            }
        });

        // إدارة الاتصال
        socket.on('disconnect', async () => {
            try {
                const userId = userSockets.get(socket.id);
                if (userId) {
                    // تحديث حالة المستخدم إلى غير متصل
                    // await User.findByIdAndUpdate(userId, { 
                    //     isOnline: false,
                    //     lastSeen: new Date() 
                    // });
                    
                    connectedUsers.delete(userId);
                    userSockets.delete(socket.id);
                    
                    // إعلام المستخدمين الآخرين
                    socket.broadcast.emit('user_offline', userId);
                    
                    console.log(`❌ المستخدم ${userId} انقطع عن الاتصال`);
                }
            } catch (error) {
                console.error('خطأ في فصل الاتصال:', error);
            }
        });

        // معالجة الأخطاء
        socket.on('error', (error) => {
            console.error('خطأ في السوكيت:', error);
        });
    });

    return {
        connectedUsers,
        userSockets
    };
}

// دالة مساعدة لإرسال إشعارات
export function sendNotificationToUser(userId, notification) {
    const socketId = connectedUsers.get(userId);
    if (socketId) {
        io.to(socketId).emit('new_notification', notification);
    }
}

// دالة مساعدة لإرسال رسالة لمجموعة من المستخدمين
export function broadcastToUsers(userIds, event, data) {
    userIds.forEach(userId => {
        const socketId = connectedUsers.get(userId);
        if (socketId) {
            io.to(socketId).emit(event, data);
        }
    });
}
