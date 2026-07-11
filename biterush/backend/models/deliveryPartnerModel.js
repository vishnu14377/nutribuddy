import mongoose from "mongoose";

const deliveryPartnerSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true, unique: true },
  vehicleType:   { type: String, enum: ['bike', 'scooter', 'bicycle', 'car'], default: 'bike' },
  vehicleNumber: { type: String, default: '' },
  isOnline:      { type: Boolean, default: false },
  isAvailable:   { type: Boolean, default: true },
  currentLocation: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }  // [longitude, latitude]
  },
  currentOrderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'order', default: null },
  totalDeliveries:  { type: Number, default: 0 },
  rating:           { type: Number, default: 5, min: 0, max: 5 },
  totalRatings:     { type: Number, default: 0 },
  earningsToday:    { type: Number, default: 0 },
  earningsTotal:    { type: Number, default: 0 },
  documents: {
    license: { type: String, default: '' },
    idProof:  { type: String, default: '' },
  },
  isVerified: { type: Boolean, default: false },
}, { timestamps: true });

deliveryPartnerSchema.index({ currentLocation: '2dsphere' });
deliveryPartnerSchema.index({ isOnline: 1, isAvailable: 1 });

const deliveryPartnerModel = mongoose.models.deliverypartner || mongoose.model("deliverypartner", deliveryPartnerSchema);
export default deliveryPartnerModel;
