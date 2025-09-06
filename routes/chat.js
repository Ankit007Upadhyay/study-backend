const express = require('express');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const router = express.Router();

// Get all messages (with pagination) - only messages from last 24 hours
router.get('/messages', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Only get messages from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const messages = await Message.find({
      createdAt: { $gte: twentyFourHoursAgo }
    })
      .populate('user', 'name role')
      .populate('replyTo', 'content userName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalMessages = await Message.countDocuments({
      createdAt: { $gte: twentyFourHoursAgo }
    });
    const totalPages = Math.ceil(totalMessages / limit);

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        currentPage: page,
        totalPages,
        totalMessages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send a new message
router.post('/messages', auth, async (req, res) => {
  try {
    const { content, replyTo } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    if (content.length > 1000) {
      return res.status(400).json({ message: 'Message too long (max 1000 characters)' });
    }

    const messageData = {
      content: content.trim(),
      user: req.user.id,
      userName: req.user.name,
      userRole: req.user.role
    };

    if (replyTo) {
      // Verify the reply-to message exists
      const parentMessage = await Message.findById(replyTo);
      if (!parentMessage) {
        return res.status(400).json({ message: 'Reply-to message not found' });
      }
      messageData.replyTo = replyTo;
    }

    const message = new Message(messageData);
    await message.save();

    // Populate the message before sending response
    await message.populate('user', 'name role');
    if (message.replyTo) {
      await message.populate('replyTo', 'content userName');
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit a message
router.put('/messages/:id', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const messageId = req.params.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    if (content.length > 1000) {
      return res.status(400).json({ message: 'Message too long (max 1000 characters)' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user owns the message or is admin
    if (message.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to edit this message' });
    }

    // Don't allow editing messages older than 15 minutes (unless admin)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (message.createdAt < fifteenMinutesAgo && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Cannot edit messages older than 15 minutes' });
    }

    message.content = content.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    await message.populate('user', 'name role');
    if (message.replyTo) {
      await message.populate('replyTo', 'content userName');
    }

    res.json(message);
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a message
router.delete('/messages/:id', auth, async (req, res) => {
  try {
    const messageId = req.params.id;
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user owns the message or is admin
    if (message.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }

    await Message.findByIdAndDelete(messageId);
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add reaction to a message
router.post('/messages/:id/reactions', auth, async (req, res) => {
  try {
    const { emoji } = req.body;
    const messageId = req.params.id;

    if (!emoji) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user already reacted with this emoji
    const existingReaction = message.reactions.find(
      reaction => reaction.user.toString() === req.user.id && reaction.emoji === emoji
    );

    if (existingReaction) {
      // Remove the reaction
      message.reactions = message.reactions.filter(
        reaction => !(reaction.user.toString() === req.user.id && reaction.emoji === emoji)
      );
    } else {
      // Add the reaction
      message.reactions.push({
        user: req.user.id,
        emoji
      });
    }

    await message.save();
    await message.populate('user', 'name role');
    if (message.replyTo) {
      await message.populate('replyTo', 'content userName');
    }

    res.json(message);
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get online users count (placeholder for socket.io integration)
router.get('/online-users', auth, async (req, res) => {
  try {
    // This will be enhanced with socket.io to show actual online users
    res.json({ count: 0, users: [] });
  } catch (error) {
    console.error('Error fetching online users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
