const urlService=require("../services/url.service")

const createUrl=async(req,res)=>{
    const {longUrl}=req.body();
    if(!longUrl){
        return res.status(400).json({error:"longurl is required"})
    }

    const url=await urlService.createShortUrl(longUrl);
    res.status(201).json({
        shortUrl:`http://localhost:3000/${url.shortCode}`
    });
};
const redirectUrl=async(req,res)=>{
    const {shortCode}=req.params;

    const url=await urlService.getLongUrl(shortCode);
    if(!url){
        return res.status(404).json({error:"url not found"});
    }
    res.redirect(url.longUrl);
}
module.exports={
    createUrl,
    redirectUrl
}