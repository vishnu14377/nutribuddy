import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import validator from "validator";
import userModel from "../models/userModel.js";
import { AppError } from "../middleware/errorHandler.js";

const createAccessToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '7d' });

const createRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '30d' });

// POST /api/user/login
export const loginUser = async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const user = await userModel.findOne({ email });
    if (!user) throw new AppError("User does not exist", 401);
    if (!user.isActive) throw new AppError("Account has been deactivated", 403);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new AppError("Invalid credentials", 401);

    const token = createAccessToken(user._id, user.role);
    const refreshToken = createRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        phone: user.phone,
      }
    });
  } catch (error) { next(error); }
};

// POST /api/user/register
export const registerUser = async (req, res, next) => {
  const { name, email, password, phone, role } = req.body;
  try {
    const exists = await userModel.findOne({ email });
    if (exists) throw new AppError("User already exists", 409);

    if (!validator.isEmail(email)) throw new AppError("Please enter a valid email", 400);
    if (password.length < 8) throw new AppError("Password must be at least 8 characters", 400);

    const allowedRoles = ['user', 'restaurant_owner', 'delivery_partner'];
    const userRole = allowedRoles.includes(role) ? role : 'user';

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new userModel({ name, email, password: hashedPassword, phone: phone || '', role: userRole });
    const user = await newUser.save();

    const token = createAccessToken(user._id, user.role);
    const refreshToken = createRefreshToken(user._id);
    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      success: true,
      token,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) { next(error); }
};

// POST /api/user/refresh
export const refreshToken = async (req, res, next) => {
  const { refreshToken } = req.body;
  try {
    if (!refreshToken) throw new AppError("Refresh token required", 401);
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    const user = await userModel.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) throw new AppError("Invalid refresh token", 401);

    const newAccessToken = createAccessToken(user._id, user.role);
    res.json({ success: true, token: newAccessToken });
  } catch (error) { next(error); }
};

// GET /api/user/profile
export const getProfile = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.id).select('-password -refreshToken');
    if (!user) throw new AppError("User not found", 404);
    res.json({ success: true, data: user });
  } catch (error) { next(error); }
};

// PUT /api/user/profile
export const updateProfile = async (req, res, next) => {
  const { name, phone, avatar } = req.body;
  try {
    const user = await userModel.findByIdAndUpdate(
      req.user.id,
      { ...(name && { name }), ...(phone && { phone }), ...(avatar && { avatar }) },
      { new: true, select: '-password -refreshToken' }
    );
    res.json({ success: true, data: user, message: 'Profile updated' });
  } catch (error) { next(error); }
};

// POST /api/user/change-password
export const changePassword = async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await userModel.findById(req.user.id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw new AppError("Current password is incorrect", 400);
    if (newPassword.length < 8) throw new AppError("New password must be at least 8 characters", 400);

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) { next(error); }
};

// GET /api/user/all  (admin)
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await userModel.find({}).select('-password -refreshToken').sort('-createdAt');
    res.json({ success: true, data: users, count: users.length });
  } catch (error) { next(error); }
};

// PATCH /api/user/:id/toggle-active  (admin)
export const toggleUserActive = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);
    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, message: `User ${user.isActive ? 'activated' : 'deactivated'}` });
  } catch (error) { next(error); }
};

// POST /api/user/logout
export const logoutUser = async (req, res, next) => {
  try {
    await userModel.findByIdAndUpdate(req.user.id, { refreshToken: '' });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) { next(error); }
};