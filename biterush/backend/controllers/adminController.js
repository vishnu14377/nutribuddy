import userModel from "../models/userModel.js";
import restaurantModel from "../models/restaurantModel.js";
import orderModel from "../models/orderModel.js";
import deliveryPartnerModel from "../models/deliveryPartnerModel.js";
import { AppError } from "../middleware/errorHandler.js";

// GET /api/admin/stats — dashboard overview (Enhanced for roles)
export const getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const role = req.user.role;
    
    // Filter for Restaurant Owners
    let filter = {};
    if (role === 'restaurant_owner') {
      const rest = await restaurantModel.findOne({ ownerId: req.user.id });
      if (!rest) {
        return res.json({
          success: true,
          data: {
            setupRequired: true,
            users:       { total: 0, today: 0 },
            restaurants: { total: 0, pending: 0 },
            orders:      { total: 0, today: 0 },
            drivers:     { online: 0 },
            revenue:     { total: 0, today: 0 },
          }
        });
      }
      filter.restaurantId = rest._id;
    }

    const [
      totalUsers, newUsersToday,
      totalRestaurants, pendingRestaurants,
      totalOrders, ordersToday,
      onlineDrivers,
      revenueData, revenueToday,
    ] = await Promise.all([
      role === 'admin' ? userModel.countDocuments({ role: 'user' }) : 0,
      role === 'admin' ? userModel.countDocuments({ role: 'user', createdAt: { $gte: today } }) : 0,
      role === 'admin' ? restaurantModel.countDocuments({ isApproved: true }) : 0,
      role === 'admin' ? restaurantModel.countDocuments({ isApproved: false }) : 0,
      orderModel.countDocuments(filter),
      orderModel.countDocuments({ ...filter, createdAt: { $gte: today } }),
      role === 'admin' ? deliveryPartnerModel.countDocuments({ isOnline: true }) : 0,
      orderModel.aggregate([
        { $match: { ...filter, paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      orderModel.aggregate([
        { $match: { ...filter, paymentStatus: 'paid', createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
    ]);

    res.json({
      success: true,
      data: {
        users:       { total: totalUsers, today: newUsersToday },
        restaurants: { total: totalRestaurants, pending: pendingRestaurants },
        orders:      { total: totalOrders, today: ordersToday },
        drivers:     { online: onlineDrivers },
        revenue:     { total: revenueData[0]?.total || 0, today: revenueToday[0]?.total || 0 },
      }
    });
  } catch (error) { next(error); }
};

// GET /api/admin/revenue-chart — last 7 days revenue (Enhanced for roles)
export const getRevenueChart = async (req, res, next) => {
  try {
    const role = req.user.role;
    let filter = {};
    if (role === 'restaurant_owner') {
      const rest = await restaurantModel.findOne({ ownerId: req.user.id });
      if (!rest) return res.json({ success: true, data: [] });
      filter.restaurantId = rest._id;
    }

    const days = 7;
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date); nextDate.setDate(date.getDate() + 1);

      const [orderCount, revenue] = await Promise.all([
        orderModel.countDocuments({ ...filter, createdAt: { $gte: date, $lt: nextDate } }),
        orderModel.aggregate([
          { $match: { ...filter, paymentStatus: 'paid', createdAt: { $gte: date, $lt: nextDate } } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]),
      ]);
      data.push({
        date:    date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
        orders:  orderCount,
        revenue: revenue[0]?.total || 0,
      });
    }
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

// PATCH /api/admin/user/:id/role
export const changeUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const validRoles = ['user', 'restaurant_owner', 'admin', 'delivery_partner'];
    if (!validRoles.includes(role)) throw new AppError("Invalid role", 400);
    const user = await userModel.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password -refreshToken');
    if (!user) throw new AppError("User not found", 404);
    res.json({ success: true, data: user, message: `Role changed to ${role}` });
  } catch (error) { next(error); }
};
