const mongoose = require("mongoose");

async function connectMongo() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/curalink";
  await mongoose.connect(mongoUri);
  console.log("MongoDB connected");
}

module.exports = { connectMongo };
