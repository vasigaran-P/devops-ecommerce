const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(express.json());

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  role: { type: String, default: "user" }
});
const User = mongoose.model("User", userSchema);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/auth", (req, res) => res.send("Auth Service Running"));
app.post("/auth/register", async (req, res) => {
  const { email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashedPassword });
  await user.save();
  res.json({ message: "User registered" });
});
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "User not found" });
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ message: "Invalid password" });
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  res.json({ token });
});
app.get("/auth/protected", authMiddleware, (req, res) => {
  res.json({ message: "Protected route", user: req.user });
});

app.listen(3001, () => console.log("Auth Service running on port 3001"));
