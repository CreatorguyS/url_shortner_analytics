const Url=require("../models/url.model")
const generateShortCode = require("../utils/base62")
const redisClient=require("../cache/redis.client")


const shortCode=generateShortCode();
const CACHE_TTL=60*60;

const  createShortUrl=async(longUrl)=>{
    const shortCode=generateShortCode();

    const url=await Url.create({
        shortCode,
        longUrl
    });

    return url;
};

const getLongUrl=async(shortcode)=>{
   
    const cachedLongUrl=await redisClient.get(shortCode);
    if(cachedLongUrl){
        return {longurl:cachedLongUrl};
    }
    console.log("cache miss");

    //fallback to mongodb
    const url=await Url.findOne({shortCode});

    if(!url)return null;

    await redisClient.set(shortCode,url.longUrl,{
        Ex:CACHE_TTL
    });
    return url;

};

module.exports={
    createShortUrl,
    getLongUrl
};