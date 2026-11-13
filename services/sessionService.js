const mongoose=require('mongoose');
const crypto=require('crypto');
const User=require('../models/User');const Availability=require('../models/Availability');const Request=require('../models/SessionRequest');const Practice=require('../models/PracticeSession');
const {blocked}=require('./matchingService');const {fail,same,id}=require('./utils');
let io;
exports.setIO=value=>{io=value;};
const update=s=>{if(s)io?.to(String(s._id)).emit('session:update',{status:s.status,endsAt:s.endsAt,extensionUsed:s.extensionUsed});};
exports.participant=(s,uid)=>same(s.learnerId,uid)||same(s.helperId,uid);
exports.get=async(sid,uid)=>{
 id(sid);const s=await Practice.findById(sid);if(!s||!exports.participant(s,uid))fail(404,'Practice session not found.');
 if(await blocked(s.learnerId,s.helperId))fail(403,'This practice is unavailable because a participant is blocked.');
 return s;
};
exports.request=async(learner,offerId,proposed)=>{
 id(offerId);const offer=await Availability.findById(offerId);if(!offer||!offer.isAvailable)fail(404,'Offer unavailable.');
 if(same(offer.helperId,learner._id))fail(400,'You cannot request your own offer.');
 const helper=await User.findById(offer.helperId);if(!helper?.helperEnabled||await blocked(learner._id,helper._id))fail(403,'This helper is unavailable.');
 const time=proposed?new Date(proposed):new Date(Math.max(Date.now(),offer.startTime.getTime()));
 if(Number.isNaN(time.getTime())||time.getTime()<Date.now()-60000||time<offer.startTime||time.getTime()+900000>offer.endTime.getTime())fail(400,'Choose a time inside the offer, leaving at least 15 minutes.');
 let created;await mongoose.connection.transaction(async session=>{
  [created]=await Request.create([{learnerId:learner._id,helperId:helper._id,availabilityId:offer._id,language:offer.language,proposedTime:time}],{session});
  const reserved=await Availability.findOneAndUpdate({_id:offer._id,reservedBy:null,isAvailable:true},{$set:{reservedBy:created._id}},{session,new:true});
  if(!reserved)fail(409,'Someone has already reserved this offer. Please choose another.');
 });return created;
};
exports.respond=async(rid,uid,action)=>{
 id(rid);if(!['accept','decline','confirm','cancel'].includes(action))fail(400,'Unknown action.');
 let request;
 await mongoose.connection.transaction(async session=>{
  const r=await Request.findById(rid).session(session);if(!r||!exports.participant(r,uid))fail(404,'Request not found.');
  if(['rejected','cancelled','completed','active'].includes(r.status))fail(409,'This request is no longer awaiting a response.');
  if(action==='accept'||action==='decline'){
   if(!same(r.helperId,uid))fail(403,'Only the helper may answer this request.');
   if(r.status!=='pending')fail(409,'This request has already been answered.');
   r.status=action==='accept'?'accepted':'rejected';
  }
  if(action==='cancel')r.status='cancelled';
  if(action==='confirm'){
   if(r.status!=='accepted')fail(409,'The helper must accept first.');
   if(await blocked(r.learnerId,r.helperId))fail(403,'A participant is blocked.');
   if(same(r.helperId,uid))r.helperConfirmed=true;else r.learnerConfirmed=true;
   if(r.helperConfirmed&&r.learnerConfirmed){
    const offer=await Availability.findById(r.availabilityId).session(session);
    if(!offer||offer.endTime.getTime()<Date.now()+900000)fail(409,'This offer has expired. Cancel it and request another time.');
    await Practice.updateOne({requestId:r._id},{$setOnInsert:{requestId:r._id,learnerId:r.learnerId,helperId:r.helperId,language:r.language,roomId:crypto.randomUUID(),scheduledFor:r.proposedTime,status:'scheduled'}},{upsert:true,session});
   }
  }
  if(['rejected','cancelled'].includes(r.status)){
   await Availability.updateOne({_id:r.availabilityId,reservedBy:r._id},{$set:{reservedBy:null}},{session});
   await Practice.updateOne({requestId:r._id,status:'scheduled'},{$set:{status:'cancelled'}},{session});
  }
  await r.save({session});request=r;
 });return request;
};
exports.enter=async(sid,uid)=>{
 let s=await exports.get(sid,uid);
 if(s.status==='scheduled'){
  if(s.scheduledFor>Date.now())fail(409,'Your room opens at the scheduled time.');
  const offer=await Availability.findOne({reservedBy:s.requestId});
  if(!offer||offer.endTime.getTime()<Date.now()+900000)fail(409,'The reserved availability has expired. Cancel this session from your dashboard.');
  const now=new Date();
  s=await Practice.findOneAndUpdate({_id:sid,status:'scheduled'},{$set:{status:'active',startedAt:now,endsAt:new Date(now.getTime()+900000)}},{new:true})||await Practice.findById(sid);
  await Request.updateOne({_id:s.requestId,status:'accepted'},{$set:{status:'active'}});
 }
 if(s.status==='active'&&s.endsAt<=Date.now())return exports.finish(sid,uid,false);
 if(s.status!=='active')fail(409,'This practice has ended.');
 s=await Practice.findByIdAndUpdate(sid,{$addToSet:{joinedIds:uid}},{new:true});update(s);return s;
};
exports.extend=async(sid,uid)=>{
 const s=await exports.get(sid,uid);if(!same(s.helperId,uid))fail(403,'Only the helper can extend a session.');
 const updated=await Practice.findOneAndUpdate({_id:sid,status:'active',extensionUsed:false,endsAt:{$gt:new Date()}},[{$set:{endsAt:{$add:['$endsAt',300000]},extensionUsed:true}}],{new:true});
 if(!updated)fail(409,'The extension was already used or the session has ended.');update(updated);return updated;
};
exports.finish=async(sid,uid,cancel=false)=>{
 await exports.get(sid,uid);let result;
 await mongoose.connection.transaction(async session=>{
  const s=await Practice.findById(sid).session(session);
  if(['completed','cancelled'].includes(s.status)){result=s;return;}
  const qualified=!cancel&&s.status==='active'&&s.joinedIds.length===2&&Date.now()-s.startedAt.getTime()>=60000;
  s.status=cancel||s.status==='scheduled'?'cancelled':'completed';s.qualified=qualified;s.completedAt=new Date();await s.save({session});
  await Request.updateOne({_id:s.requestId},{$set:{status:s.status}},{session});
  await Availability.updateOne({reservedBy:s.requestId},{$set:{reservedBy:null}},{session});
  if(qualified){await User.updateOne({_id:s.helperId},{$inc:{helpGiven:1}},{session});await User.updateOne({_id:s.learnerId},{$inc:{helpReceived:1}},{session});}
  result=s;
 });update(result);return result;
};
exports.expire=async()=>{
 const expired=await Practice.find({status:'active',endsAt:{$lte:new Date()}});
 for(const s of expired){try{await exports.finish(s._id,s.helperId);}catch(e){if(e.status!==403)throw e;}}
};
