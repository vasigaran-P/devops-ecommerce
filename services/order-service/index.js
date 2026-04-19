const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(express.json());

// DB connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// Test route
app.get("/", (req, res) => {
  res.send("Order Service Running");
});

app.listen(3003, () => {
  console.log("Order Service running on port 3003");
});
