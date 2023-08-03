import mongoose from "mongoose";
const uri = "mongodb+srv://izumi326:Dattanhanh1606@ive.ambrj3e.mongodb.net/chatapp";

async function database() {
    try {
        await mongoose.connect(uri);
        console.log('connect success')
    } catch (e) {
        console.log(e);
    }
}

export default database;