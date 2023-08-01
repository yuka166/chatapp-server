import mongoose from 'mongoose';
const { Schema } = mongoose;

const Chat = new Schema({
    roomID: { type: mongoose.Types.ObjectId, required: true, ref: 'room' },
    authorID: { type: mongoose.Types.ObjectId, required: true, ref: 'user' },
    content: { type: String, required: true },
});

export default mongoose.model('chat', Chat);