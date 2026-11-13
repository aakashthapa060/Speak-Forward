require('dotenv').config();const bcrypt=require('bcrypt');const mongoose=require('mongoose');const connect=require('../config/db');const User=require('../models/User');const Availability=require('../models/Availability');
async function seed(){
 if(process.env.NODE_ENV==='production')throw new Error('Demo seeding is disabled in production.');
 const password=process.env.DEMO_PASSWORD;if(!password||password.length<10||Buffer.byteLength(password)>72)throw new Error('Set DEMO_PASSWORD to 10+ characters (at most 72 bytes) in .env.');
 await connect(process.env.MONGODB_URI);await User.init();const passwordHash=await bcrypt.hash(password,12);
 const profiles=[
  {name:'Aakash Thapa',username:'aakash',country:'Canada',timeZone:'America/Toronto',bio:'Computer science student, coffee enthusiast, and a believer that every conversation teaches you something. Let’s trade stories about music, travel and everyday life.',spoken:'Nepali',learning:'Portuguese',goals:'Feel confident speaking Portuguese in everyday situations.',helperEnabled:false},
  {name:'Sofia Almeida',username:'sofia',country:'Brazil',timeZone:'America/Sao_Paulo',bio:'Olá! I’m Sofia, a Brazilian Portuguese speaker who loves good coffee, weekend walks, and helping people find their voice. We can practice everyday phrases at your pace. No perfect grammar required.',spoken:'Portuguese',learning:'English',goals:'Meet people around the world and make Portuguese feel a little more like home.',helperEnabled:true},
  {name:'Oliver Reed',username:'oliver',country:'United Kingdom',timeZone:'Europe/London',bio:'A book lover with a soft spot for hiking and slow Sundays. Happy to help you build confidence in everyday English.',spoken:'English',learning:'Japanese',helperEnabled:true},
  {name:'Camille Martin',username:'camille',country:'France',timeZone:'Europe/Paris',bio:'Bonjour! Let’s talk about films, food, and your everyday adventures. Patient, friendly French practice with room to make mistakes.',spoken:'French',learning:'Spanish',helperEnabled:true},
  {name:'Mateo Rivera',username:'mateo',country:'Mexico',timeZone:'America/Mexico_City',bio:'Music, street food, and a good conversation. I’d love to help you feel comfortable speaking Spanish, one small step at a time.',spoken:'Spanish',learning:'English',helperEnabled:true},
  {name:'Hana Sato',username:'hana',country:'Japan',timeZone:'Asia/Tokyo',bio:'こんにちは! I enjoy photography and little neighborhood cafés. Let’s practice simple Japanese and learn about each other’s world.',spoken:'Japanese',learning:'French',helperEnabled:true}
 ];
 for(const p of profiles){
  let user=await User.findOne({username:p.username});
  if(!user)user=await User.create({name:p.name,username:p.username,email:p.username+'@speakforward.test',passwordHash,adultConfirmed:true,country:p.country,timeZone:p.timeZone,bio:p.bio,goals:p.goals||'Connect with people through everyday conversation.',helperEnabled:p.helperEnabled,languagesSpoken:[{language:p.spoken,level:'Native'}],languagesLearning:[{language:p.learning,level:'Beginner'}]});
  if(p.helperEnabled&&!await Availability.exists({helperId:user._id,endTime:{$gt:new Date()}}))await Availability.create({helperId:user._id,language:p.spoken,level:'Beginner',startTime:new Date(Date.now()-60000),endTime:new Date(Date.now()+6*86400000)});
 }
 console.log('Seed complete. Existing profiles and passwords were preserved. New accounts use DEMO_PASSWORD. See README for emails.');await mongoose.disconnect();
}if(require.main===module)seed().catch(async e=>{console.error(e.message);await mongoose.disconnect();process.exitCode=1;});module.exports=seed;
