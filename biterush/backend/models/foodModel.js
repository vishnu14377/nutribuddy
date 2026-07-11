import mongoose from "mongoose";

const foodSchema = new mongoose.Schema({
  name:            { type: String, required: true, trim: true },
  description:     { type: String, required: true },
  price:           { type: Number, required: true, min: 0 },
  image:           { type: String, required: true },
  category:        { type: String, required: true },
  restaurantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'restaurant', default: null },
  isAvailable:     { type: Boolean, default: true },
  preparationTime: { type: Number, default: 15 },  // minutes
  tags:            [{ type: String }],
  rating:          { type: Number, default: 0 },
  totalRatings:    { type: Number, default: 0 },
}, { timestamps: true });

foodSchema.index({ name: 'text', description: 'text', category: 'text', tags: 'text' });

const foodModel = mongoose.models.food || mongoose.model("food", foodSchema);
export default foodModel;