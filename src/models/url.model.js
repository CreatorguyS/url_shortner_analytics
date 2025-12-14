const mongoose=require('mongoose')

const urlSchema=new mongoose.Schema({
    shortCode:{
        type:String,
        required:true,
        unique:true,
        index:true
    },
    longUrl:{
        type:String,
        required:true
    },
    clicks:{
        type:Number,
        default:0
    }
},
{timestamps:true}
);

module.exports=mongoose.model("Url",urlSchema)