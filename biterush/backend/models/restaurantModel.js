import mongoose from "mongoose";

const restaurantSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  cuisine:     [{ type: String }],
  ownerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  email:       { type: String, required: true },
  phone:       { type: String, required: true },
  image:       { type: String, default: '' },
  coverImage:  { type: String, default: '' },
  address: {
    street:  { type: String, required: true },
    city:    { type: String, required: true },
    state:   { type: String, required: true },
    pincode: { type: String, required: true },
  },
  location: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }  // [longitude, latitude]
  },
  isApproved:      { type: Boolean, default: false },
  isOpen:          { type: Boolean, default: true },
  isActive:        { type: Boolean, default: true },
  rating:          { type: Number, default: 0, min: 0, max: 5 },
  totalRatings:    { type: Number, default: 0 },
  deliveryTime:    { type: Number, default: 30 },  // minutes
  minimumOrder:    { type: Number, default: 100 },  // ₹
  deliveryCharge:  { type: Number, default: 50 },
}, { timestamps: true });

restaurantSchema.index({ location: '2dsphere' });
restaurantSchema.index({ name: 'text', description: 'text', cuisine: 'text' });

const restaurantModel = mongoose.models.restaurant || mongoose.model("restaurant", restaurantSchema);
export default restaurantModel;
