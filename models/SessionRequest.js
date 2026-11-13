const {Schema,model}=require('mongoose');
const schema=new Schema({learnerId:{type:Schema.Types.ObjectId,ref:'User',required:true},helperId:{type:Schema.Types.ObjectId,ref:'User',required:true},availabilityId:{type:Schema.Types.ObjectId,ref:'Availability',required:true},language:{type:String,required:true},proposedTime:{type:Date,required:true},status:{type:String,enum:['pending','accepted','rejected','cancelled','active','completed'],default:'pending'},learnerConfirmed:{type:Boolean,default:false},helperConfirmed:{type:Boolean,default:false}}, {timestamps:true});
schema.index({helperId:1,status:1});schema.index({learnerId:1,status:1});
module.exports=model('SessionRequest',schema);
