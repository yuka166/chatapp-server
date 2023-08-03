import mongoose from 'mongoose';
const { Schema } = mongoose;

const Room = new Schema({
    members: { type: [mongoose.Types.ObjectId], require: true, ref: 'user' },
    admin: { type: [mongoose.Types.ObjectId], require: true, ref: 'user', default: undefined },
    name: { type: String }
}, { timestamps: true });

export default mongoose.model('room', Room);