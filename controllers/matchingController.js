const {discover}=require('../services/matchingService');const service=require('../services/sessionService');const {fail,languages,levels}=require('../services/utils');
exports.page=(req,res)=>res.render('pages/match',{title:'A little less searching. More speaking.',languages,levels});
exports.match=async(req,res)=>{
 if(!languages.includes(req.body.language)||!levels.includes(req.body.level))fail(400,'Choose a language and level.');
 const candidates=await discover(req.user,{language:req.body.language,level:req.body.level,available:req.body.available});
 if(!candidates.length)fail(404,'No matching offers right now. Try another level or browse upcoming offers.');
 // Deterministic: least Help Given first, then name; earliest offer first.
 res.json({profileUrl:'/profile/'+candidates[0].user._id});
};
exports.request=async(req,res)=>{await service.request(req.user,req.body.offerId,req.body.proposedTime);res.json({ok:true,redirect:'/dashboard'});};
exports.respond=async(req,res)=>{await service.respond(req.params.id,req.user._id,req.body.action);res.json({ok:true});};
