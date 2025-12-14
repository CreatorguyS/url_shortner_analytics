const redis=require("redis");

const redisClient=redis.createClient({
    url:"redis://localhost:6379"
});

redisClient.on("connect",()=>{
    console.log("redis is connected")
});

redis.on("error",(err)=>{
    console.log("redis error is",err);
})

(async()=>{
    await redisClient.connect();
})();

module.exports=redisClient;