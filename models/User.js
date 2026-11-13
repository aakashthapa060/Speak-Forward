const { Schema, model } = require('mongoose');
const language = new Schema({ language: {type: String, required: true, maxlength: 40}, level: {type: String, enum: ['Beginner','Intermediate','Advanced','Native'], required: true} }, {_id:false});
module.exports = model('User', new Schema({
 name: {type:String,required:true,maxlength:80}, username:{type:String,required:true,unique:true,lowercase:true,match:/^[a-z0-9_]{3,24}$/},
 email:{type:String,required:true,unique:true,lowercase:true,select:false}, passwordHash:{type:String,required:true,select:false},
 adultConfirmed:{type:Boolean,required:true}, profileImage:{type:String,default:''}, bio:{type:String,maxlength:600,default:''}, country:{type:String,maxlength:80,default:''}, timeZone:{type:String,default:'America/Toronto'},
 languagesSpoken:{type:[language],default:[]}, languagesLearning:{type:[language],default:[]}, goals:{type:String,maxlength:300,default:''}, helperEnabled:{type:Boolean,default:false},
 helpGiven:{type:Number,default:0,min:0},helpReceived:{type:Number,default:0,min:0}
}, {timestamps:true}));
