const mongoose=require('mongoose');
exports.fail=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
exports.id=(value)=>{if(!mongoose.isValidObjectId(value))exports.fail(400,'Invalid identifier.');return value;};
exports.same=(a,b)=>String(a?._id||a)===String(b?._id||b);
exports.text=(v,max=300)=>typeof v==='string'?v.trim().slice(0,max):'';
exports.languages=['English','Portuguese','French','Spanish','Japanese','Nepali','Hindi','Korean','Mandarin','German','Arabic','Italian'];
exports.levels=['Beginner','Intermediate','Advanced','Native'];
