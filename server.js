// server2.js
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Conexão com base de dados dos sensores
const sensorPool = new Pool({
  connectionString: process.env.DATABASE_URL_SENSORS,
  ssl: { rejectUnauthorized: false }
});

// Conexão com base de dados dos perfis
const userPool = new Pool({
  connectionString: process.env.DATABASE_URL_USERS,
  ssl: { rejectUnauthorized: false }
});

// ✅ ROTA: Receber dados de sensores
app.post("/api/receive-data", async (req, res) => {
  const { temperature, humidity, nitrogen, phosphorus, potassium, created_at, humidity_air, deviceid } = req.body;

  if ([temperature, humidity, nitrogen, phosphorus, potassium, created_at, humidity_air, deviceid].some(v => v === undefined)) {
    return res.status(400).json({ success: false, error: "Missing one or more required fields." });
  }

  try {
    const query = `
      INSERT INTO readings (temperature, humidity, nitrogen, phosphorus, potassium, created_at, humidity_air, deviceid)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    await sensorPool.query(query, [temperature, humidity, nitrogen, phosphorus, potassium, created_at, humidity_air, deviceid]);
    res.json({ success: true, message: "Sensor data inserted successfully." });
  } catch (err) {
    console.error("❌ Database error (readings):", err.message);
    res.status(500).json({ success: false, error: "Internal server error." });
  }
});

// ✅ ROTA: Buscar os últimos dados de sensores
app.get("/api/readings", async (req, res) => {
  try {
    const result = await sensorPool.query(`
      SELECT * FROM readings
      ORDER BY created_at DESC
      LIMIT 300
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("❌ Error fetching readings:", err.message);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ✅ ROTA: Salvar ou atualizar dados do perfil do usuário
app.post("/api/profile", async (req, res) => {
  const { email, first_name, last_name, device_ID, device_key } = req.body;

  if (!email || !first_name || !last_name || !device_ID || !device_key) {
    return res.status(400).json({ success: false, message: "Missing required fields." });
  }

  try {
    // Garante que o email está na tabela 'users' para satisfazer a foreign key
    await userPool.query(
      `INSERT INTO users (email) VALUES ($1) ON CONFLICT DO NOTHING`,
      [email]
    );

    // Insere novo perfil (nova linha) SEM sobrescrever outros registros
    const query = `
      INSERT INTO profiles (email, firstname, lastname, device_id, device_key)
      VALUES ($1, $2, $3, $4, $5)
    `;

    await userPool.query(query, [email, first_name, last_name, device_ID, device_key]);

    res.json({ success: true, message: "Profile saved successfully." });
  } catch (err) {
    console.error("❌ Error inserting profile:", err.message);
    res.status(500).json({ success: false, message: "Database error." });
  }
});



// server.js
app.get("/api/user-profile", async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).json({ 
      success: false, 
      message: "Email é obrigatório" 
    });
  }

  try {
    const result = await userPool.query(
  `SELECT firstname as first_name, lastname as last_name, device_id 
   FROM profiles 
   WHERE email = $1 
   ORDER BY id DESC 
   LIMIT 1`,  // ✅ Pega o último inserido
  [email]
);


    if (result.rows.length > 0) {
      return res.json({ 
        success: true, 
        profile: result.rows[0] // Pega o primeiro resultado
      });
    } else {
      return res.json({ 
        success: false, 
        message: "Perfil não encontrado" 
      });
    }
  } catch (error) {
    console.error("❌ Erro no banco de dados:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Erro interno do servidor",
      error: error.message
    });
  }
});
app.post("/api/alerts", async (req, res) => {
  const { created_at, message, device_id } = req.body;

  if (!created_at || !message || !device_id) {
    return res.status(400).json({ success: false, message: "Missing fields." });
  }

  try {
    await userPool.query(
      `INSERT INTO alerts (created_at, message, device_id) VALUES ($1, $2, $3)`,
      [created_at, message, device_id]
    );
    res.json({ success: true, message: "Alert added." });
  } catch (err) {
    console.error("❌ Error adding alert:", err.message);
    res.status(500).json({ success: false, message: "Database error." });
  }
});

// GET /api/alerts?device_id=XYZ
app.get("/api/alerts", async (req, res) => {
  const { device_id } = req.query;

  if (!device_id) {
    return res.status(400).json({ success: false, message: "Device ID is required." });
  }

  try {
    const result = await userPool.query(
      `SELECT created_at, message FROM alerts WHERE device_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [device_id]
    );
    res.json({ success: true, alerts: result.rows });
  } catch (err) {
    console.error("Error fetching alerts:", err.message);
    res.status(500).json({ success: false, message: "Database error." });
  }
});



// ✅ Inicia o servidor
app.listen(port, () => {
  console.log(`✅ Server2 is running on port ${port}`);
});
