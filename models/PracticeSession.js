const {Schema,model}=require('mongoose');
const schema=new Schema({requestId:{type:Schema.Types.ObjectId,ref:'SessionRequest',required:true,unique:true},learnerId:{type:Schema.Types.ObjectId,ref:'User',required:true},helperId:{type:Schema.Types.ObjectId,ref:'User',required:true},roomId:{type:String,required:true,unique:true},language:String,status:{type:String,enum:['scheduled','active','completed','cancelled'],default:'scheduled'},scheduledFor:{type:Date,required:true},startedAt:Date,endsAt:Date,extensionUsed:{type:Boolean,default:false},completedAt:Date,qualified:{type:Boolean,default:false},joinedIds:[{type:Schema.Types.ObjectId,ref:'User'}]}, {timestamps:true});
schema.index({status:1,endsAt:1});
module.exports=model('PracticeSession',schema);
