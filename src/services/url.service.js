const Url=require("../models/url.model")
const generateShortCode = require("../utils/base62")

const shortCode=require("../utils/base62")

const  createShortUrl=async(longUrl)=>{
    const shortCode=generateShortCode();

    const url=await Url.create({
        shortCode,
        longUrl
    });

    return url;
};

const getLongUrl=async(shortcode)=>{
    return Url.findone({shortcode});
};

module.exports={
    createShortUrl,
    getLongUrl
};