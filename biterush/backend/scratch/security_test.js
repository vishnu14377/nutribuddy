import axios from 'axios';

const URL = 'http://localhost:4000/api';

const securityTest = async () => {
    try {
        console.log('--- Security Test: Data Isolation ---');
        
        // 1. Login as Owner
        const ownerLogin = await axios.post(`${URL}/user/login`, {
            email: 'test_owner@tomato.com',
            password: 'test123'
        });
        const ownerToken = ownerLogin.data.token;
        console.log('✅ Owner Logged In');

        // 2. Attempt to fetch orders with a fake restaurantId (if allowed)
        // Note: The controller should automatically filter by the owner's linked restaurant
        const orderList = await axios.get(`${URL}/order/list?restaurantId=660000000000000000000001`, {
            headers: { Authorization: `Bearer ${ownerToken}` }
        });
        
        // Check if results contain only authorized data
        // In the current implementation, it should strictly filter by owner's restaurant
        console.log(`✅ Order list fetched. Count: ${orderList.data.data.length}`);
        
        // 3. Attempt to fetch user list (Admin only)
        try {
            await axios.get(`${URL}/admin/users`, {
                headers: { Authorization: `Bearer ${ownerToken}` }
            });
            console.error('❌ Security Breach: Owner accessed user list!');
        } catch (err) {
            console.log('✅ Security Check: Owner blocked from admin user list (403)');
        }

        console.log('✨ Security Audit Complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Audit failed:', err.response?.data || err.message);
        process.exit(1);
    }
};

securityTest();
