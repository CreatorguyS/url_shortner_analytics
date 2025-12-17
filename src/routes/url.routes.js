const express=require("express");

const rateLimiter=require("../middlewares/rateLimiter")


const router=express.Router();
const urlController=require('../controllers/url.controller')

router.post("/url",urlController.createUrl);

router.get("/:shortCode",rateLimiter,urlController.redirectUrl)

module.exports=router;
