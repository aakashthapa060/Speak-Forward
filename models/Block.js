const {Schema,model}=require('mongoose');
const schema=new Schema({blockerId:{type:Schema.Types.ObjectId,ref:'User',required:true},blockedUserId:{type:Schema.Types.ObjectId,ref:'User',required:true}},{timestamps:true});
schema.index({blockerId:1,blockedUserId:1},{unique:true});module.exports=model('Block',schema);
