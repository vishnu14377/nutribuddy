import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const NEW_PASSWORD = 'Owner@123456';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const { default: userModel }       = await import('../models/userModel.js');
  const { default: restaurantModel } = await import('../models/restaurantModel.js');

  // Reset ALL restaurant_owner passwords and show info
  const owners = await userModel.find({ role: 'restaurant_owner' });
  const hashed = await bcrypt.hash(NEW_PASSWORD, 10);

  for (const owner of owners) {
    owner.password   = hashed;
    owner.isVerified = true;
    owner.isActive   = true;
    await owner.save();

    const restaurants = await restaurantModel.find({ ownerId: owner._id });
    console.log('👤 Owner Account Ready');
    console.log('─────────────────────────────────────────');
    console.log('  Name     :', owner.name);
    console.log('  Email    :', owner.email);
    console.log('  Password :', NEW_PASSWORD);
    console.log('  User ID  :', owner._id.toString());
    console.log('  Restaurants linked:', restaurants.length);
    restaurants.forEach(r => {
      console.log(`    📍 ${r.name} (ID: ${r._id}) | approved: ${r.isApproved}`);
    });
    console.log('─────────────────────────────────────────\n');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
