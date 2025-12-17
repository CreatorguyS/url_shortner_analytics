const urlService=require("../services/url.service")

const analyticsQueue=require("../queue/analytics.queue")


const createUrl=async(req,res)=>{
    const {longUrl}=req.body
    if(!longUrl){
        return res.status(400).json({error:"longurl is required"})
    }

    const url=await urlService.createShortUrl(longUrl);
    res.status(201).json({
        shortUrl:`http://localhost:3000/${url.shortCode}`
    });
};
const redirectUrl = async (req, res) => {
  try {
    const { shortCode } = req.params;

    const url = await urlService.getLongUrl(shortCode);

    if (!url) {
      return res.status(404).json({ error: "URL not found" });
    }
     await analyticsQueue.add("increment-click",{
      shortCode
     });
    console.log("REDIRECTING TO:", url.longUrl); // 👈 ADD THIS

    res.redirect(url.longUrl);
  } catch (error) {
    console.error("REDIRECT ERROR:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports={
    createUrl,
    redirectUrl
}