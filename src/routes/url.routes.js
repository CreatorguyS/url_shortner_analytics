const express=require("express");

const router=express.Router();
const urlController=require('../controllers/url.controller')

router.post("/url",urlController.createUrl);

router.get("/:shortCode",urlController.redirectUrl)

module.exports=router;
