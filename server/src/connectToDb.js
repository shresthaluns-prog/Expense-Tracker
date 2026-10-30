import mongoose from "mongoose";

const connectToDb = (() => {
    mongoose.connect("mongodb://localhost:27017/Expense"),
    console.log("Application is connected to database successfully.")
});