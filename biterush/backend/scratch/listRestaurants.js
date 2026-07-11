import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const { default: userModel } = await import('../models/userModel.js');
  const { default: restaurantModel } = await import('../models/restaurantModel.js');

  // List restaurant owner users
  const owners = await userModel.find({ role: 'restaurant_owner' }).select('name email role isActive isVerified');
  console.log(`📋 Restaurant Owner Users (${owners.length}):`);
  console.log('─────────────────────────────────────────────────────');
  owners.forEach(o => {
    console.log(`  Name     : ${o.name}`);
    console.log(`  Email    : ${o.email}`);
    console.log(`  Active   : ${o.isActive}  |  Verified: ${o.isVerified}`);
    console.log(`  User ID  : ${o._id}`);
    console.log('  ─────────────────────────────────────────────');
  });

  // List restaurants
  const restaurants = await restaurantModel.find({}).select('name email ownerId isActive isApproved');
  console.log(`\n🍽️  Restaurants (${restaurants.length}):`);
  console.log('─────────────────────────────────────────────────────');
  restaurants.forEach(r => {
    console.log(`  Name       : ${r.name}`);
    console.log(`  Email      : ${r.email}`);
    console.log(`  Restaurant ID : ${r._id}`);
    console.log(`  Owner ID   : ${r.ownerId}`);
    console.log(`  Active     : ${r.isActive}  |  Approved: ${r.isApproved}`);
    console.log('  ─────────────────────────────────────────────');
  });

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
