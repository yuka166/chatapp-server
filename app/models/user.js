import mongoose from 'mongoose';
const { Schema } = mongoose;

const User = new Schema({
    username: { type: String, required: true, unique: true },
    displayname: { type: String },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
}, { timestamps: true });

export default mongoose.model('user', User);