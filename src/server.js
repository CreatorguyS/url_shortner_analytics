const app=require("./app");
const connectDB=require('./db/mongo')


const port=3000;

connectDB();


app.listen(port,()=>{
    console.log(`server is running on ${port}`);
});