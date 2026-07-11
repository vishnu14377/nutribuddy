import axios from 'axios';

const URL = 'http://localhost:4000/api';

const testFlow = async () => {
    try {
        console.log('--- Phase 1: Customer Login ---');
        const userLogin = await axios.post(`${URL}/user/login`, {
            email: 'test_user@tomato.com',
            password: 'test123'
        });
        const userToken = userLogin.data.token;
        console.log('✅ User Logged In');

        console.log('--- Phase 2: Get Food List ---');
        const foodRes = await axios.get(`${URL}/food/list`);
        const foodItems = foodRes.data.data;
        const itemToOrder = foodItems.find(f => f.restaurantId); 
        if (!itemToOrder) throw new Error("No food items found with a restaurantId!");
        console.log(`✅ Found item: ${itemToOrder.name} from restaurant: ${itemToOrder.restaurantId}`);

        console.log('--- Phase 3: Place Order ---');
        const orderRes = await axios.post(`${URL}/order/place`, {
            items: [{ itemId: itemToOrder._id, name: itemToOrder.name, price: itemToOrder.price, quantity: 1, image: itemToOrder.image }],
            amount: itemToOrder.price,
            address: { firstName: 'Test', lastName: 'User', email: 'test_user@tomato.com', street: '123 Test St', city: 'TestCity', state: 'TS', zipcode: '000000', country: 'India', phone: '1234567890' },
            restaurantId: itemToOrder.restaurantId
        }, { headers: { Authorization: `Bearer ${userToken}` } });
        
        const order = orderRes.data.data;
        console.log(`✅ Order Placed! ID: ${order._id}`);

        console.log('--- Phase 4: Owner Login ---');
        const ownerLogin = await axios.post(`${URL}/user/login`, {
            email: 'test_owner@tomato.com',
            password: 'test123'
        });
        const ownerToken = ownerLogin.data.token;
        console.log('✅ Owner Logged In');

        console.log('--- Phase 5: Owner Accepts Order ---');
        await axios.post(`${URL}/order/status`, {
            orderId: order._id,
            status: 'Preparing'
        }, { headers: { Authorization: `Bearer ${ownerToken}` } });
        console.log('✅ Order status updated to Preparing');

        console.log('--- Phase 6: Driver Login ---');
        const driverLogin = await axios.post(`${URL}/user/login`, {
            email: 'test_driver@tomato.com',
            password: 'test123'
        });
        const driverToken = driverLogin.data.token;
        console.log('✅ Driver Logged In');

        console.log('--- Phase 7: Check Driver Tasks ---');
        const tasksRes = await axios.get(`${URL}/order/driver-tasks`, {
            headers: { Authorization: `Bearer ${driverToken}` }
        });
        if (tasksRes.data.data.length > 0) {
            console.log(`✅ Driver assigned to order: ${tasksRes.data.data[0]._id}`);
        } else {
            console.warn('⚠️ No tasks found for driver. Check assignment service.');
        }

        console.log('✨ End-to-End API Test Complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Test failed:', err.response?.data || err.message);
        process.exit(1);
    }
};

testFlow();
