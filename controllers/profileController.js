const crypto=require('crypto');const path=require('path');const fs=require('fs/promises');const sharp=require('sharp');
const User=require('../models/User');const Availability=require('../models/Availability');const Block=require('../models/Block');const Report=require('../models/Report');const Request=require('../models/SessionRequest');const Practice=require('../models/PracticeSession');
const service=require('../services/sessionService');const {blocked}=require('../services/matchingService');const {fail,text,id,same,languages,levels}=require('../services/utils');
exports.show=async(req,res)=>{
 id(req.params.id);const profile=await User.findById(req.params.id);if(!profile)fail(404,'Profile not found.');
 const unavailable=req.user&&!same(req.user,profile)&&await blocked(req.user._id,profile._id);
 const offers=unavailable?[]:await Availability.find({helperId:profile._id,isAvailable:true,reservedBy:null,endTime:{$gte:new Date(Date.now()+900000)}}).sort({startTime:1});
 res.render('pages/profile',{title:profile.name,profile,offers,unavailable});
};
exports.edit=async(req,res)=>{
 const blocks=await Block.find({blockerId:req.user._id}).populate('blockedUserId','name');
 res.render('pages/edit-profile',{title:'Your profile',languages,levels,blocks});
};
function languageList(body,key){
 const result=[];
 for(let i=0;i<3;i++){
  const suffix=i||'',language=text(body[key+'Language'+suffix],40),level=text(body[key+'Level'+suffix],40);
  if(!language)continue;
  if(!languages.includes(language)||!levels.includes(level))fail(400,'Choose a supported language and proficiency level.');
  if(!result.some(l=>l.language===language))result.push({language,level});
 }
 return result;
}
exports.update=async(req,res)=>{
 const name=text(req.body.name,80);if(!name)fail(400,'Your name is required.');
 const timeZone=text(req.body.timeZone,80)||'UTC';try{new Intl.DateTimeFormat('en',{timeZone});}catch{fail(400,'Enter a valid time zone, such as America/Toronto.');}
 const fields={name,bio:text(req.body.bio,600),country:text(req.body.country,80),timeZone,goals:text(req.body.goals,300),helperEnabled:req.body.helperEnabled==='on',languagesSpoken:languageList(req.body,'spoken'),languagesLearning:languageList(req.body,'learning')};
 if(req.body.removeImage==='on')fields.profileImage='';
 if(req.file){
  if(!['image/png','image/jpeg','image/webp'].includes(req.file.mimetype))fail(400,'Upload a JPG, PNG or WebP image.');
  let buffer;try{buffer=await sharp(req.file.buffer,{limitInputPixels:20000000}).rotate().resize(600,600,{fit:'cover'}).webp({quality:85}).toBuffer();}catch{fail(400,'This file is not a valid supported image.');}
  const filename=crypto.randomUUID()+'.webp';const dir=path.join(__dirname,'../public/assets/images/uploads');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,filename),buffer);fields.profileImage='/assets/images/uploads/'+filename;
 }
 await User.findByIdAndUpdate(req.user._id,{$set:fields},{runValidators:true});req.session.notice='Your profile has been updated.';res.redirect('/profile/'+req.user._id);
};
exports.block=async(req,res)=>{
 id(req.params.id);if(same(req.params.id,req.user._id)||!await User.exists({_id:req.params.id}))fail(400,'Choose another user.');
 // End shared sessions before enforcing the block, so neither side can keep chatting.
 const shared={$or:[{learnerId:req.user._id,helperId:req.params.id},{helperId:req.user._id,learnerId:req.params.id}]};
 for(const s of await Practice.find({...shared,status:{$in:['active','scheduled']}}))await service.finish(s._id,req.user._id,true);
 for(const r of await Request.find({...shared,status:{$in:['pending','accepted']}}))await service.respond(r._id,req.user._id,'cancel');
 await Block.updateOne({blockerId:req.user._id,blockedUserId:req.params.id},{$setOnInsert:{blockerId:req.user._id,blockedUserId:req.params.id}},{upsert:true});res.json({ok:true});
};
exports.unblock=async(req,res)=>{id(req.params.id);await Block.deleteOne({blockerId:req.user._id,blockedUserId:req.params.id});res.json({ok:true});};
exports.report=async(req,res)=>{
 id(req.params.id);if(same(req.params.id,req.user._id)||!await User.exists({_id:req.params.id}))fail(400,'Choose another user.');
 const reason=text(req.body.reason,50),description=text(req.body.description,1000);
 if(!['Harassment','Inappropriate content','Spam','Other'].includes(reason)||!description)fail(400,'Choose a reason and describe the issue.');
 if(req.body.sessionId){const s=await service.get(req.body.sessionId,req.user._id);if(!service.participant(s,req.params.id))fail(400,'That user is not in this session.');}
 await Report.create({reporterId:req.user._id,reportedUserId:req.params.id,sessionId:req.body.sessionId||undefined,reason,description});res.json({ok:true});
};
