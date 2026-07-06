const mongoose=require("mongoose");
require("dotenv").config();


const connectDB=async()=>{
    try{
        await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/url-shortener")

        console.log("mongodb connected");
    }catch(error){
        console.log("mongodb connection failed",error);
        process.exit(1);
    }
};
module.exports=connectDB;