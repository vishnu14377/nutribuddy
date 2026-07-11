import mongoose from 'mongoose';
import 'dotenv/config';
import userModel from './models/userModel.js';
import restaurantModel from './models/restaurantModel.js';
import foodModel from './models/foodModel.js';
import deliveryPartnerModel from './models/deliveryPartnerModel.js';

const verify = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const users = await userModel.countDocuments();
        const restaurants = await restaurantModel.countDocuments();
        const foods = await foodModel.countDocuments();
        const drivers = await deliveryPartnerModel.countDocuments();

        console.log(`--- DB State ---`);
        console.log(`Users: ${users}`);
        console.log(`Restaurants: ${restaurants}`);
        console.log(`Food Items: ${foods}`);
        console.log(`Drivers: ${drivers}`);

        const spicyTadka = await restaurantModel.findOne({ name: 'Spicy Tadka' });
        if (spicyTadka) {
            const spicyFoodCount = await foodModel.countDocuments({ restaurantId: spicyTadka._id });
            console.log(`Spicy Tadka Food Count: ${spicyFoodCount}`);
            console.log(`Owner Linked: ${spicyTadka.ownerId ? 'Yes' : 'No'}`);
        } else {
            console.log('Spicy Tadka not found!');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
verify();
