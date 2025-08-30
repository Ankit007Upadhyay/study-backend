const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Get all files with filters
router.get('/', async (req, res) => {
  try {
    const { semester, subject, fileType, branch, search } = req.query;
    let query = {};

    if (semester) query.semester = parseInt(semester);
    if (subject) query.subject = new RegExp(subject, 'i');
    if (branch) query.branch = new RegExp(branch, 'i');
    if (fileType) query.fileType = fileType;
    if (search) {
      query.$or = [
        { title: new RegExp(search, 'i') },
        { subject: new RegExp(search, 'i') },
        { branch: new RegExp(search, 'i') }
      ];
    }

    const files = await File.find(query)
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(files);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Upload file (Admin only)
router.post('/upload', adminAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { title, subject, branch, semester, fileType } = req.body;

    if (!title || !subject || !branch || !semester || !fileType) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const newFile = new File({
      title,
      subject,
      branch,
      semester: parseInt(semester),
      fileType,
      filename: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      uploadedBy: req.user._id
    });

    await newFile.save();

    const populatedFile = await File.findById(newFile._id)
      .populate('uploadedBy', 'name');

    res.status(201).json({
      message: 'File uploaded successfully',
      file: populatedFile
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Download file
router.get('/download/:id', auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const filePath = path.join(__dirname, '../uploads', file.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    // Increment download count
    file.downloadCount += 1;
    await file.save();

    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', 'application/pdf');
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete file by ID
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    console.log('Delete request received for file ID:', req.params.id);
    console.log('User role:', req.user?.role);
    
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid file ID format' });
    }
    
    const file = await File.findById(req.params.id);
    if (!file) {
      console.log('File not found in database');
      return res.status(404).json({ message: 'File not found' });
    }
    
    console.log('File found:', file.title);
    
    // Delete from database first
    const deletedFile = await File.findByIdAndDelete(req.params.id);
    if (!deletedFile) {
      return res.status(404).json({ message: 'File could not be deleted from database' });
    }
    console.log('File deleted from database');
    
    // Delete physical file
    const filePath = path.join(__dirname, '..', 'uploads', file.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log('Physical file deleted');
      } catch (fsError) {
        console.log('Error deleting physical file:', fsError.message);
        // Don't fail the request if physical file deletion fails
      }
    } else {
      console.log('Physical file not found');
    }
    
    res.json({ 
      message: 'File deleted successfully',
      deletedFile: {
        id: deletedFile._id,
        title: deletedFile.title
      }
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete all files - must come AFTER the single file delete route
router.delete('/all', adminAuth, async (req, res) => {
  try {
    const files = await File.find();
    
    // Delete all physical files
    files.forEach(file => {
      const filePath = path.join(__dirname, '..', 'uploads', file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
    
    // Delete all records from database
    await File.deleteMany({});
    
    res.json({ message: 'All files deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get file statistics (Admin only)
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const totalFiles = await File.countDocuments();
    const totalDownloads = await File.aggregate([
      { $group: { _id: null, total: { $sum: '$downloadCount' } } }
    ]);

    const filesByType = await File.aggregate([
      { $group: { _id: '$fileType', count: { $sum: 1 } } }
    ]);

    const filesBySemester = await File.aggregate([
      { $group: { _id: '$semester', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      totalFiles,
      totalDownloads: totalDownloads[0]?.total || 0,
      filesByType,
      filesBySemester
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
