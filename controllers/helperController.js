const Availability=require('../models/Availability');const {discover}=require('../services/matchingService');const {fail,id,text,languages,levels}=require('../services/utils');
exports.list=async(req,res)=>{const helpers=await discover(req.user,req.query);res.render('pages/helpers',{title:'Find your people',helpers,query:req.query,languages,levels});};
exports.availability=async(req,res)=>{const offers=await Availability.find({helperId:req.user._id}).sort({startTime:1});res.render('pages/availability',{title:'Make room for a conversation',offers,languages,levels});};
exports.saveOffer=async(req,res)=>{
 const startTime=new Date(req.body.startTime),endTime=new Date(req.body.endTime),language=text(req.body.language,40),level=text(req.body.level,40);
 if(!languages.includes(language)||!levels.includes(level))fail(400,'Choose a valid language and level.');
 if(!req.user.helperEnabled)fail(400,'Enable helping in your profile before creating an offer.');
 if(!Number.isFinite(startTime.getTime())||!Number.isFinite(endTime.getTime())||endTime-startTime<900000||endTime<Date.now()+900000||endTime-startTime>7*86400000)fail(400,'Use an availability window of 15 minutes to 7 days that still has time for a session.');
 const data={helperId:req.user._id,language,level,startTime,endTime,isAvailable:true};
 if(req.body.id){id(req.body.id);const updated=await Availability.findOneAndUpdate({_id:req.body.id,helperId:req.user._id,reservedBy:null},{$set:data},{new:true,runValidators:true});if(!updated)fail(409,'Offer not found or already reserved.');}
 else await Availability.create(data);
 res.json({ok:true});
};
exports.removeOffer=async(req,res)=>{id(req.params.id);const result=await Availability.deleteOne({_id:req.params.id,helperId:req.user._id,reservedBy:null});if(!result.deletedCount)fail(409,'Offer not found or reserved. Cancel its request first.');res.json({ok:true});};
