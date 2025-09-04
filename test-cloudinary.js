require('dotenv').config();
const cloudinary = require('./config/cloudinary');

async function testCloudinaryConnection() {
  try {
    console.log('Testing Cloudinary connection...');
    console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
    
    // Test connection by getting account details
    const result = await cloudinary.api.ping();
    console.log('✅ Cloudinary connection successful!');
    console.log('Response:', result);
    
    // Test upload capabilities by uploading a small test file
    const testUpload = await cloudinary.uploader.upload('data:text/plain;base64,SGVsbG8gV29ybGQ=', {
      resource_type: 'raw',
      folder: 'study-notes',
      public_id: 'test-connection'
    });
    
    console.log('✅ Test upload successful!');
    console.log('Upload URL:', testUpload.secure_url);
    
    // Clean up test file
    await cloudinary.uploader.destroy('study-notes/test-connection', { resource_type: 'raw' });
    console.log('✅ Test cleanup completed');
    
  } catch (error) {
    console.error('❌ Cloudinary test failed:');
    console.error('Error:', error.message);
    if (error.http_code) {
      console.error('HTTP Code:', error.http_code);
    }
  }
}

testCloudinaryConnection();
