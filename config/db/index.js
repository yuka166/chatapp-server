import mongoose from "mongoose";
const uri = "mongodb://127.0.0.1:27017/chatapp";

async function database() {
    try {
        await mongoose.connect(uri);
        console.log('connect success')
    } catch (e) {
        console.log(e);
    }
}

export default database;