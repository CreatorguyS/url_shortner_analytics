const Url=require("../models/url.model")
const generateShortCode = require("../utils/base62")
const redisClient=require("../cache/redis.client")


const shortCode=generateShortCode();
const CACHE_TTL=60*60;

const  createShortUrl=async(longUrl)=>{

    if(!longUrl.startsWith("http://")&&!longUrl.startsWith("https://")){
        longurl="https://"+longUrl;
    }
    const shortCode=generateShortCode();

    const url=await Url.create({
        shortCode,
        longUrl
    });

    return url;
};

const getLongUrl=async(shortCode)=>{
    const cachedLongUrl=await redisClient.get(shortCode);
    if(cachedLongUrl){
        console.log("CACHE HIT");

        await Url.updateOne(
            {shortCode},
            {$inc:{clicks:1}}
        );

        return {longUrl:cachedLongUrl};
    }
    console.log("CACHE MISS");

    const url=await Url.findOne({shortCode});

    if(!url)return null;

    url.clicks+=1;

    await url.save();

    await redisClient.set(shortCode,url.longUrl,{
        EX:CACHE_TTL
    });
    return url;
 
}
module.exports={
    createShortUrl,
    getLongUrl
};