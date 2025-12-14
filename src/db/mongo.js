const mongoose=require("mongoose");

const connectDB=async()=>{
    try{
        await mongoose.connect("mongodb://127.0.0.1:27017/url_shortener");
        console.log("mongodb connected");
    }catch(error){
        console.log("mongodb connection failed",error);
        process.exit(1);
    }
};
module.exports=connectDB;