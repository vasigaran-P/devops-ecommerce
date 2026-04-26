const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(express.json());

// DB connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

/* -------- AUTH MIDDLEWARE -------- */
const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;

  if (!token) {
    return res.status(401).json({ message: "No token" });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

/* -------- PROTECTED ROUTE -------- */
app.get("/", authMiddleware, (req, res) => {
  res.send("Order Service Running (Protected)");
});

/* -------- OPTIONAL -------- */
app.get("/user", authMiddleware, (req, res) => {
  res.json(req.user);
});

app.listen(3003, () => {
  console.log("Order Service running on port 3003");
});
