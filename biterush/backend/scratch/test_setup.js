import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import 'dotenv/config';
import userModel from '../models/userModel.js';
import restaurantModel from '../models/restaurantModel.js';
import deliveryPartnerModel from '../models/deliveryPartnerModel.js';

const setupTestEnv = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB for setup');

        const salt = await bcrypt.genSalt(10);
        const hashedPass = await bcrypt.hash('test123', salt);

        // 1. Create/Update Test User
        let customer = await userModel.findOne({ email: 'test_user@tomato.com' });
        if (!customer) {
            customer = new userModel({ name: 'Test Customer', email: 'test_user@tomato.com', password: hashedPass, role: 'user', phone: '0000000001' });
            await customer.save();
            console.log('👤 test_user@tomato.com / test123');
        }

        // 2. Create/Update Test Owner
        let owner = await userModel.findOne({ email: 'test_owner@tomato.com' });
        if (!owner) {
            owner = new userModel({ name: 'Test Owner', email: 'test_owner@tomato.com', password: hashedPass, role: 'restaurant_owner', phone: '0000000002' });
            await owner.save();
            console.log('🧑‍🍳 test_owner@tomato.com / test123');
        }

        // 3. Create/Update Test Driver
        let driverUser = await userModel.findOne({ email: 'test_driver@tomato.com' });
        if (!driverUser) {
            driverUser = new userModel({ name: 'Test Driver', email: 'test_driver@tomato.com', password: hashedPass, role: 'delivery_partner', phone: '0000000003' });
            await driverUser.save();
        }
        
        // Ensure Driver Profile exists
        let driverProfile = await deliveryPartnerModel.findOne({ userId: driverUser._id });
        if (!driverProfile) {
            driverProfile = new deliveryPartnerModel({
                userId: driverUser._id,
                vehicleType: 'bike',
                vehicleNumber: 'TEST-001',
                isOnline: true,
                isAvailable: true,
                isVerified: true,
                currentLocation: { type: 'Point', coordinates: [72.8777, 19.0760] } // Close to the restaurant
            });
            await driverProfile.save();
            console.log('🚴 test_driver@tomato.com / test123');
        } else {
            driverProfile.isOnline = true;
            driverProfile.isAvailable = true;
            await driverProfile.save();
        }

        // 4. Link Spicy Tadka to Owner
        const rest = await restaurantModel.findOne({ name: 'Spicy Tadka' });
        if (rest) {
            rest.ownerId = owner._id;
            rest.isApproved = true;
            rest.isOpen = true;
            rest.location = { type: 'Point', coordinates: [72.8777, 19.0760] };
            await rest.save();
            console.log('🏪 Spicy Tadka linked to test_owner');
        }

        console.log('✨ Environment setup complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Setup failed:', err);
        process.exit(1);
    }
};

setupTestEnv();
