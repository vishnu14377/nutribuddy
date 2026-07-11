import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const ADMIN_EMAIL    = 'admin@tomato.com';
const ADMIN_PASSWORD = 'Admin@Tomato2024';
const ADMIN_NAME     = 'Super Admin';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Dynamically load model AFTER connection
  const { default: userModel } = await import('../models/userModel.js');

  // Check if admin already exists
  const existing = await userModel.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log('⚠️  Admin already exists:', existing.email);
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = new userModel({
    name:       ADMIN_NAME,
    email:      ADMIN_EMAIL,
    password:   hashedPassword,
    role:       'admin',
    isVerified: true,
    isActive:   true,
  });

  await admin.save();
  console.log('🎉 Admin account created successfully!');
  console.log('─────────────────────────────────────');
  console.log('  Email   :', ADMIN_EMAIL);
  console.log('  Password:', ADMIN_PASSWORD);
  console.log('  Role    : admin');
  console.log('─────────────────────────────────────');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
