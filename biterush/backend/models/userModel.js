import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone:    { type: String, default: '' },
  avatar:   { type: String, default: '' },
  role:     { type: String, enum: ['user', 'restaurant_owner', 'admin', 'delivery_partner'], default: 'user' },
  isVerified: { type: Boolean, default: false },
  isActive:   { type: Boolean, default: true },
  refreshToken: { type: String, default: '' },
  fcmToken:     { type: String, default: '' },
  cartData:     { type: Object, default: {} },
  savedAddresses: [{
    label:   String,
    street:  String,
    city:    String,
    state:   String,
    pincode: String,
    isDefault: { type: Boolean, default: false }
  }]
}, { minimize: false, timestamps: true });

const userModel = mongoose.models.user || mongoose.model("user", userSchema);
export default userModel;