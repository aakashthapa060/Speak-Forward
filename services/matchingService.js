const User=require('../models/User');
const Availability=require('../models/Availability');
const Block=require('../models/Block');
const {text}=require('./utils');
exports.blocked=async(a,b)=>Boolean(await Block.exists({$or:[{blockerId:a,blockedUserId:b},{blockerId:b,blockedUserId:a}]}));
exports.discover=async(user,query={})=>{
 const blocks=user?await Block.find({$or:[{blockerId:user._id},{blockedUserId:user._id}]}):[];
 const excluded=blocks.map(b=>String(b.blockerId)===String(user._id)?b.blockedUserId:b.blockerId);if(user)excluded.push(user._id);
 const filter={isAvailable:true,reservedBy:null,endTime:{$gte:new Date(Date.now()+15*60000)}};
 if(query.language)filter.language=text(query.language,40);
 if(query.level)filter.level=text(query.level,40);
 if(query.available==='now')filter.startTime={$lte:new Date()};
 const offers=await Availability.find(filter).sort({startTime:1});
 const uf={helperEnabled:true,_id:{$in:offers.map(o=>o.helperId),$nin:excluded}};
 if(query.q)uf.name={$regex:text(query.q,80).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'};
 const users=await User.find(uf).sort({helpGiven:1,name:1}).limit(60);
 return users.map(u=>({user:u,offers:offers.filter(o=>String(o.helperId)===String(u._id))}));
};
