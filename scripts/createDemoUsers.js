const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const createDemoUsers = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/study-notes-platform');
    console.log('✅ Connected to MongoDB');

    // Check if demo users already exist
    const existingAdmin = await User.findOne({ email: 'admin@studyhub.com' });
    const existingStudent = await User.findOne({ email: 'student@studyhub.com' });

    if (!existingAdmin) {
      const adminUser = new User({
        name: 'Admin User',
        email: 'admin@studyhub.com',
        password: 'admin123',
        role: 'admin'
      });
      await adminUser.save();
      console.log('✅ Demo admin user created');
    } else {
      console.log('ℹ️  Demo admin user already exists');
    }

    if (!existingStudent) {
      const studentUser = new User({
        name: 'Demo Student',
        email: 'student@studyhub.com',
        password: 'student123',
        role: 'user'
      });
      await studentUser.save();
      console.log('✅ Demo student user created');
    } else {
      console.log('ℹ️  Demo student user already exists');
    }

    console.log('\n🎉 Demo users setup complete!');
    console.log('\nDemo Credentials:');
    console.log('Admin: admin@studyhub.com / admin123');
    console.log('Student: student@studyhub.com / student123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating demo users:', error);
    process.exit(1);
  }
};

createDemoUsers();
