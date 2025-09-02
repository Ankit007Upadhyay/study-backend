const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const { auth, adminAuth } = require('../middleware/auth');
const cloudinary = require('../config/cloudinary');

const router = express.Router();

// Configure multer for memory storage (Cloudinary upload)
const storage = multer.memoryStorage();

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

// Helper function to upload to Cloudinary
const uploadToCloudinary = (buffer, originalname) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: 'study-notes',
        public_id: `${Date.now()}-${originalname.replace(/\.[^/.]+$/, '')}`,
        use_filename: true
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

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

    // Upload to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer, req.file.originalname);

    const newFile = new File({
      title,
      subject,
      branch,
      semester: parseInt(semester),
      fileType,
      filename: cloudinaryResult.public_id,
      originalName: req.file.originalname,
      filePath: cloudinaryResult.secure_url,
      cloudinaryUrl: cloudinaryResult.secure_url,
      cloudinaryPublicId: cloudinaryResult.public_id,
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
    console.error('Upload error:', error);
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

    // Increment download count
    file.downloadCount += 1;
    await file.save();

    // For Cloudinary files, redirect to the secure URL
    if (file.cloudinaryUrl) {
      res.redirect(file.cloudinaryUrl);
    } else {
      // Fallback for old local files
      const filePath = path.join(__dirname, '../uploads', file.filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'File not found on server' });
      }

      res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
      res.setHeader('Content-Type', 'application/pdf');
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    }
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
    
    // Delete from Cloudinary if it's a cloud file
    if (file.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(file.cloudinaryPublicId, { resource_type: 'raw' });
        console.log('File deleted from Cloudinary');
      } catch (cloudinaryError) {
        console.log('Error deleting from Cloudinary:', cloudinaryError.message);
      }
    } else {
      // Delete local file for backward compatibility
      const filePath = path.join(__dirname, '..', 'uploads', file.filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log('Physical file deleted');
        } catch (fsError) {
          console.log('Error deleting physical file:', fsError.message);
        }
      }
    }
    
    // Delete from database
    const deletedFile = await File.findByIdAndDelete(req.params.id);
    if (!deletedFile) {
      return res.status(404).json({ message: 'File could not be deleted from database' });
    }
    console.log('File deleted from database');
    
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
    
    // Delete all files from Cloudinary and local storage
    for (const file of files) {
      if (file.cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(file.cloudinaryPublicId, { resource_type: 'raw' });
        } catch (cloudinaryError) {
          console.log('Error deleting from Cloudinary:', cloudinaryError.message);
        }
      } else {
        // Delete local file for backward compatibility
        const filePath = path.join(__dirname, '..', 'uploads', file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
    
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
