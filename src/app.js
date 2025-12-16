const express=require("express");
const urlController=require("./controllers/url.controller")
const urlRoutes=require("./routes/url.routes")
const app=express();

app.use(express.json())

app.use("/api",urlRoutes);

app.get("/:shortCode",urlController.redirectUrl);
app.get("/health",(req,res)=>{
    res.status(200).json({
        status:"ok",
        message:"server is working fine"
    });
});

module.exports=app;

