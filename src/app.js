const express=require("express");

const urlRoutes=require("./routes/url.routes")
const app=express();

app.use(express.json())

app.use("/api",urlRoutes);

app.get("/health",(req,res)=>{
    res.status(200).json({
        status:"ok",
        message:"server is working fine"
    });
});

module.exports=app;

