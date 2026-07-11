import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const NEW_PASSWORD = 'Admin@Tomato2024';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const { default: userModel } = await import('../models/userModel.js');

  const admin = await userModel.findOne({ role: 'admin' });
  if (!admin) {
    console.log('❌ No admin account found. Run createAdmin.js first.');
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 10);
  admin.password = hashedPassword;
  admin.isVerified = true;
  admin.isActive = true;
  await admin.save();

  console.log('\n🎉 Admin account is ready!');
  console.log('─────────────────────────────────────');
  console.log('  Name    :', admin.name);
  console.log('  Email   :', admin.email);
  console.log('  Password:', NEW_PASSWORD);
  console.log('  Role    :', admin.role);
  console.log('─────────────────────────────────────');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
