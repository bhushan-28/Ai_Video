const mongoose = require("mongoose");
require("dotenv").config();

async function connectDB() {
  try {
    if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('<db_username>')) {
      return;
    }
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 4000
    });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.warn("MongoDB connection warning:", error.message);
  }
}

module.exports = connectDB;
