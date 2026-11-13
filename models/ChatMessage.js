const {Schema,model}=require('mongoose');
const schema=new Schema({sessionId:{type:Schema.Types.ObjectId,ref:'PracticeSession',required:true,index:true},senderId:{type:Schema.Types.ObjectId,ref:'User',required:true},text:{type:String,required:true,maxlength:2000}},{timestamps:true});
schema.index({createdAt:1},{expireAfterSeconds:2592000});module.exports=model('ChatMessage',schema);
