const {Schema,model}=require('mongoose');
const schema=new Schema({helperId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},language:{type:String,required:true},level:{type:String,enum:['Beginner','Intermediate','Advanced','Native'],required:true},startTime:{type:Date,required:true},endTime:{type:Date,required:true},isAvailable:{type:Boolean,default:true},reservedBy:{type:Schema.Types.ObjectId,ref:'SessionRequest',default:null}}, {timestamps:true});
schema.index({language:1,isAvailable:1,endTime:1});
module.exports=model('Availability',schema);
