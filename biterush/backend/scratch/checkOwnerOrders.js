import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const { default: orderModel } = await import('../models/orderModel.js');
  const { default: restaurantModel } = await import('../models/restaurantModel.js');
  
  // Test Owner: test_owner@tomato.com
  const ownerId = "69da4b274c9895336b540fe7";
  const rest = await restaurantModel.findOne({ ownerId });
  
  console.log(`\n🏪 Restaurant for owner ${ownerId}:`);
  if (rest) {
    console.log(`  Name: ${rest.name}`);
    console.log(`  ID  : ${rest._id}`);
    
    const count = await orderModel.countDocuments({ restaurantId: rest._id });
    console.log(`  Order Count: ${count}`);
    
    if (count > 0) {
      const lastOrder = await orderModel.findOne({ restaurantId: rest._id }).sort({ createdAt: -1 });
      console.log(`  Latest Order: ${lastOrder._id} (Status: ${lastOrder.status})`);
    }
  } else {
    console.log("  No restaurant found!");
  }
  
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
