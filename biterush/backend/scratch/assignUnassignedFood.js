import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const { default: foodModel } = await import('../models/foodModel.js');
  const { default: restaurantModel } = await import('../models/restaurantModel.js');

  const unassigned = await foodModel.find({ 
    $or: [{ restaurantId: null }, { restaurantId: { $exists: false } }] 
  });
  
  console.log(`🔍 Found ${unassigned.length} food items with no restaurantId.`);

  if (unassigned.length > 0) {
    const defaultRest = await restaurantModel.findOne({ name: 'Spicy Tadka' }) || await restaurantModel.findOne({});
    if (defaultRest) {
      console.log(`🚀 Assigning ${unassigned.length} items to "${defaultRest.name}" (${defaultRest._id})...`);
      const result = await foodModel.updateMany(
        { $or: [{ restaurantId: null }, { restaurantId: { $exists: false } }] },
        { $set: { restaurantId: defaultRest._id } }
      );
      console.log(`✅ Success: ${result.modifiedCount} items updated.`);
    } else {
      console.log('❌ Error: No restaurants found in database to assign items to.');
    }
  }
  
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
