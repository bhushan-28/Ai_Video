import mongoose from "mongoose";
import dotenv from "dotenv";
import { mongoManager } from "./database/mongo.js";

dotenv.config();

export async function connectDB() {
  return await mongoManager.connect();
}

export default connectDB;
