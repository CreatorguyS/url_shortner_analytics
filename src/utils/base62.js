const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const generateShortCode=(length=6)=>{
    let result="";
    for(let i=0;i<length;i++){
        result+=chars.charAt(Math.random()*chars.length);
    }
    return result;
};

module.exports=generateShortCode;