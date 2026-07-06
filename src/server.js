const app=require("./app");
const connectDB=require('./db/mongo')
require("dotenv").config();


const PORT = process.env.PORT || 3000;


connectDB();


app.listen(PORT,()=>{
    console.log(`server is running on ${PORT}`);
});