const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('./models/User');
const File = require('./models/File');

// Sample data
const sampleUsers = [
  {
    name: 'Admin User',
    email: 'admin@studyplatform.com',
    password: 'admin123',
    role: 'admin'
  },
  {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'password123',
    role: 'user'
  },
  {
    name: 'Jane Smith',
    email: 'jane@example.com',
    password: 'password123',
    role: 'user'
  }
];

const sampleBranches = [
  'Computer Science Engineering',
  'Information Technology',
  'Electronics Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Electrical Engineering'
];

const sampleSubjects = [
  'Data Structures and Algorithms',
  'Database Management Systems',
  'Operating Systems',
  'Computer Networks',
  'Software Engineering',
  'Web Development',
  'Machine Learning',
  'Artificial Intelligence',
  'Mathematics',
  'Physics'
];

const fileTypes = ['Study Notes', 'Question Paper', 'Solution'];

async function initializeDatabase() {
  try {
    console.log('🔄 Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('🧹 Clearing existing data...');
    await User.deleteMany({});
    await File.deleteMany({});
    console.log('✅ Existing data cleared');

    // Create indexes
    console.log('📊 Creating database indexes...');
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await File.collection.createIndex({ subject: 1, semester: 1, fileType: 1, branch: 1 });
    await File.collection.createIndex({ title: 'text', subject: 'text', branch: 'text' });
    console.log('✅ Database indexes created');

    // Create sample users
    console.log('👥 Creating sample users...');
    const createdUsers = [];
    for (const userData of sampleUsers) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log(`   ✓ Created user: ${user.email}`);
    }

    // Create sample file records (metadata only - no actual files)
    console.log('📁 Creating sample file records...');
    const sampleFiles = [];
    
    for (let i = 0; i < 15; i++) {
      const randomUser = createdUsers[Math.floor(Math.random() * createdUsers.length)];
      const randomBranch = sampleBranches[Math.floor(Math.random() * sampleBranches.length)];
      const randomSubject = sampleSubjects[Math.floor(Math.random() * sampleSubjects.length)];
      const randomFileType = fileTypes[Math.floor(Math.random() * fileTypes.length)];
      const randomSemester = Math.floor(Math.random() * 8) + 1;
      
      const fileData = {
        title: `${randomSubject} - ${randomFileType} ${i + 1}`,
        subject: randomSubject,
        branch: randomBranch,
        semester: randomSemester,
        fileType: randomFileType,
        filename: `sample_file_${i + 1}.pdf`,
        originalName: `${randomSubject.replace(/\s+/g, '_')}_${randomFileType.replace(/\s+/g, '_')}_${i + 1}.pdf`,
        filePath: `/uploads/sample_file_${i + 1}.pdf`,
        fileSize: Math.floor(Math.random() * 5000000) + 100000, // Random size between 100KB and 5MB
        uploadedBy: randomUser._id,
        downloadCount: Math.floor(Math.random() * 50)
      };
      
      const file = new File(fileData);
      await file.save();
      sampleFiles.push(file);
      console.log(`   ✓ Created file record: ${file.title}`);
    }

    console.log('\n🎉 Database initialization completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   👥 Users created: ${createdUsers.length}`);
    console.log(`   📁 File records created: ${sampleFiles.length}`);
    console.log('\n🔐 Sample Login Credentials:');
    console.log('   Admin: admin@studyplatform.com / admin123');
    console.log('   User 1: john@example.com / password123');
    console.log('   User 2: jane@example.com / password123');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB Atlas');
    process.exit(0);
  }
}

// Run the initialization
if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };
