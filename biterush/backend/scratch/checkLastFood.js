import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const { default: foodModel } = await import('../models/foodModel.js');
  
  const foods = await foodModel.find({}).sort({ createdAt: -1 }).limit(5);
  console.log('\n🍔 Last 5 Food Items Added:');
  console.log('─────────────────────────────────────────');
  foods.forEach(f => {
    console.log(`  Name      : ${f.name}`);
    console.log(`  Image     : ${f.image}`);
    console.log(`  Added     : ${f.createdAt}`);
    console.log('  ─────────────────────────────────────');
  });
  process.exit(0);
}
main().catch(err => { console.error(err.message); process.exit(1); });
