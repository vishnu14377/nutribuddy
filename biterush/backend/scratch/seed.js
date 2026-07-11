import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import 'dotenv/config';
import userModel from '../models/userModel.js';
import restaurantModel from '../models/restaurantModel.js';
import foodModel from '../models/foodModel.js';

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB for seeding');

    // 1. Create/Get Admin User
    let admin = await userModel.findOne({ email: 'admin@tomato.com' });
    if (!admin) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      admin = new userModel({
        name: 'Super Admin',
        email: 'admin@tomato.com',
        password: hashedPassword,
        role: 'admin',
        phone: '1234567890',
        isActive: true
      });
      await admin.save();
      console.log('👤 Admin account ready: admin@tomato.com / admin123');
    }

    // 2. Create/Get a Test Restaurant (Owner is Admin for simplicity in seed)
    let restaurant = await restaurantModel.findOne({ name: 'Spicy Tadka' });
    if (!restaurant) {
      restaurant = new restaurantModel({
        name: 'Spicy Tadka',
        description: 'Authentic Indian Curry & Kebabs',
        cuisine: ['Indian', 'North Indian', 'Tandoori'],
        address: { street: '123 Spice Lane', city: 'Mumbai', state: 'MH', pincode: '400001' },
        phone: '9876543210',
        email: 'info@spicytadka.com',
        ownerId: admin._id,
        image: 'menu_1.png',
        rating: 4.5,
        totalRatings: 120,
        deliveryTime: 30,
        minimumOrder: 200,
        isApproved: true,
        isOpen: true,
        location: { type: 'Point', coordinates: [72.8777, 19.0760] }
      });
      await restaurant.save();
      console.log('🏪 Restaurant created: Spicy Tadka');
    }

    // 3. Create some food items
    const foodItems = [
      { name: 'Greek Salad', description: 'Fresh vegetables with feta cheese', price: 149, category: 'Salad', image: 'food_1.png', restaurantId: restaurant._id },
      { name: 'Paneer Tikka', description: 'Grilled cottage cheese with spices', price: 299, category: 'Pure Veg', image: 'food_2.png', restaurantId: restaurant._id },
      { name: 'Chicken Roll', description: 'Spicy chicken wrapped in a paratha', price: 180, category: 'Rolls', image: 'food_7.png', restaurantId: restaurant._id }
    ];

    for (const item of foodItems) {
      const exists = await foodModel.findOne({ name: item.name, restaurantId: restaurant._id });
      if (!exists) {
        await new foodModel(item).save();
      }
    }
    console.log('🍕 Food items seeded');

    console.log('✨ Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
