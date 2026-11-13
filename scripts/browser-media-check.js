const express=require('express');const path=require('path');
const app=express();
app.get('/',(_req,res)=>res.sendFile(path.join(__dirname,'../tests/browser-media.html')));
app.get('/js/peer-call.js',(_req,res)=>res.sendFile(path.join(__dirname,'../public/js/peer-call.js')));
app.listen(3090,'127.0.0.1',()=>console.log('Open http://localhost:3090 and press Run media test. Uses generated media, not physical camera/microphone. Ctrl+C stops the test server.'));
