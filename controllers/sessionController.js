const User=require('../models/User');const Request=require('../models/SessionRequest');const Practice=require('../models/PracticeSession');const Chat=require('../models/ChatMessage');const service=require('../services/sessionService');const {same}=require('../services/utils');
exports.dashboard=async(req,res)=>{
 await service.expire();const scope={$or:[{learnerId:req.user._id},{helperId:req.user._id}]};
 const requests=await Request.find({...scope,status:{$in:['pending','accepted']}}).populate('helperId learnerId','name profileImage').sort({createdAt:-1});
 const sessions=await Practice.find(scope).populate('helperId learnerId','name profileImage').sort({createdAt:-1}).limit(100);
 const fresh=await User.findById(req.user._id);res.locals.user=fresh;
 res.render('pages/dashboard',{title:'Your next conversation starts here',requests,sessions});
};
exports.room=async(req,res)=>{
 let practice=await service.get(req.params.id,req.user._id);
 if(practice.status==='active'&&practice.endsAt<=Date.now()){await service.finish(practice._id,req.user._id);return res.redirect('/dashboard');}
 const helper=await User.findById(practice.helperId),learner=await User.findById(practice.learnerId);
 res.render('pages/room',{title:practice.language+' practice',practice,helper,learner,partner:same(req.user._id,helper._id)?learner:helper});
};
exports.state=async(req,res)=>{let s=await service.get(req.params.id,req.user._id);if(s.status==='active'&&s.endsAt<=Date.now())s=await service.finish(s._id,req.user._id);res.json({status:s.status,endsAt:s.endsAt,extensionUsed:s.extensionUsed,serverNow:Date.now()});};
exports.enter=async(req,res)=>{const s=await service.enter(req.params.id,req.user._id);res.json({status:s.status,endsAt:s.endsAt,extensionUsed:s.extensionUsed,serverNow:Date.now()});};
exports.extend=async(req,res)=>{const s=await service.extend(req.params.id,req.user._id);res.json({endsAt:s.endsAt});};
exports.end=async(req,res)=>{await service.finish(req.params.id,req.user._id,req.body.cancel===true);res.json({ok:true});};
exports.messages=async(req,res)=>{await service.get(req.params.id,req.user._id);const messages=await Chat.find({sessionId:req.params.id}).sort({createdAt:-1}).limit(100).populate('senderId','name');res.json(messages.reverse().map(m=>({id:m._id,senderId:m.senderId._id,name:m.senderId.name,text:m.text,createdAt:m.createdAt})));};

exports.rtcConfig=async(req,res)=>{
 const practice=await service.get(req.params.id,req.user._id);
 if(practice.status!=='active'||practice.endsAt<=Date.now())require('../services/utils').fail(409,'This practice is not active.');
 res.set('Cache-Control','no-store');
 res.json(require('../config/rtc')(String(req.user._id)));
};
