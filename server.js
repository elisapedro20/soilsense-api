// server.js
const express = require("express");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
//connect to webapp
const cors = require("cors");
app.use(cors());
// Connect to PostgreSQL using environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Route to receive sensor data
app.post("/api/receive-data", async (req, res) => {
  const { temperature, humidity, nitrogen, phosphorus, potassium } = req.body;

  if ([temperature, humidity, nitrogen, phosphorus, potassium].some(v => v === undefined)) {
    return res.status(400).json({ success: false, error: "Missing one or more required fields." });
  }

  try {
    const query = `
      INSERT INTO readings (temperature, humidity, nitrogen, phosphorus, potassium)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await pool.query(query, [temperature, humidity, nitrogen, phosphorus, potassium]);
    res.json({ success: true, message: "Data inserted successfully." });
  } catch (err) {
    console.error("❌ Database error:", err.message);

    res.status(500).json({ success: false, error: "Internal server error." });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
