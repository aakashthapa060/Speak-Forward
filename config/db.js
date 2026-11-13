const mongoose = require('mongoose');
module.exports = async function connectDB(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('MongoDB must be a replica set (see README) or Atlas cluster for atomic session completion.');
};
