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

// ✅ ROTA: Buscar os últimos dados de sensores (com filtro opcional por device_id!)
app.get("/api/readings", async (req, res) => {
  const device_id = req.query.device_id;

  try {
    let query = `SELECT * FROM readings `;
    let params = [];

    if (device_id) {
      query += `WHERE deviceid = $1 `;
      params.push(device_id);
    }

    query += `ORDER BY created_at DESC LIMIT 300`;

    const result = await sensorPool.query(query, params);
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
    // Verifica se já existe profiles com (email, device_ID)
    const checkResult = await userPool.query(
      `SELECT id FROM profiles WHERE email = $1 AND device_id = $2`,
      [email, device_ID]
    );

    if (checkResult.rows.length > 0) {
      // Já existe → atualiza apenas o perfil
      await userPool.query(
        `UPDATE profiles 
         SET firstname = $1, lastname = $2, device_key = $3
         WHERE email = $4 AND device_id = $5`,
        [first_name, last_name, device_key, email, device_ID]
      );

      return res.json({ success: true, message: "Profile updated successfully." });
    } else {
      // Não existe → insere um novo registro
      await userPool.query(
        `INSERT INTO profiles (email, firstname, lastname, device_id, device_key)
         VALUES ($1, $2, $3, $4, $5)`,
        [email, first_name, last_name, device_ID, device_key]
      );

      return res.json({ success: true, message: "Profile created successfully." });
    }

  } catch (err) {
    console.error("❌ Error inserting/updating profile:", err.message);
    res.status(500).json({ success: false, message: "Database error." });
  }
});

// ✅ ROTA: Buscar todos os profiles de um user
app.get("/api/user-profile", async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email é obrigatório" });
  }

  try {
    const result = await userPool.query(
      `SELECT firstname as first_name, lastname as last_name, device_id 
       FROM profiles 
       WHERE email = $1 
       ORDER BY id DESC`,
      [email]
    );

    if (result.rows.length > 0) {
      return res.json({ success: true, profiles: result.rows });
    } else {
      return res.json({ success: false, message: "Perfil não encontrado" });
    }
  } catch (error) {
    console.error("❌ Erro no banco de dados:", error);
    return res.status(500).json({ success: false, message: "Erro interno do servidor", error: error.message });
  }
});

// ✅ ROTA: Buscar o último profile de um user
app.get("/api/user-profile-last", async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).json({ success: false, message: "Email é obrigatório" });
  }

  try {
    const result = await userPool.query(
      `SELECT firstname as first_name, lastname as last_name, device_id 
       FROM profiles 
       WHERE email = $1 
       ORDER BY id DESC 
       LIMIT 1`,
      [email]
    );

    if (result.rows.length > 0) {
      return res.json({ success: true, profile: result.rows[0] });
    } else {
      return res.json({ success: false, message: "Perfil não encontrado" });
    }
  } catch (error) {
    console.error("❌ Erro no banco de dados:", error);
    return res.status(500).json({ success: false, message: "Erro interno do servidor", error: error.message });
  }
});

// ✅ ROTA: Adicionar device para um user
app.post("/api/add-device", async (req, res) => {
  const { email, device_ID } = req.body;

  if (!email || !device_ID) {
    return res.status(400).json({ success: false, message: "Missing required fields (email, device_ID)." });
  }

  try {
    // Adiciona device só se não existir ainda
    await userPool.query(
      `INSERT INTO profiles (email, firstname, lastname, device_id, device_key)
       VALUES ($1, '', '', $2, '')
       ON CONFLICT (email, device_id) DO NOTHING`,
      [email, device_ID]
    );

    res.json({ success: true, message: "Device added successfully." });
  } catch (err) {
    console.error("❌ Error adding device:", err.message);
    res.status(500).json({ success: false, message: "Database error." });
  }
});

// ✅ ROTA: Adicionar alerta
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

// ✅ ROTA: Buscar alerts de um device
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




// ✅ ROTA: Buscar perfil de um user para um device específico
app.get("/api/user-profile-by-device", async (req, res) => {
  const { email, device_id } = req.query;

  if (!email || !device_id) {
    return res.status(400).json({ success: false, message: "Missing email or device_id" });
  }

  try {
    const result = await userPool.query(
      `SELECT firstname as first_name, lastname as last_name, device_id 
       FROM profiles 
       WHERE email = $1 AND device_id = $2`,
      [email, device_id]
    );

    if (result.rows.length > 0) {
      return res.json({ success: true, profile: result.rows[0] });
    } else {
      return res.json({ success: false, message: "Perfil não encontrado" });
    }
  } catch (error) {
    console.error("❌ Erro no banco de dados:", error);
    return res.status(500).json({ success: false, message: "Erro interno do servidor", error: error.message });
  }
});

// ✅ ROTA: Salvar dados de irrigação
app.post("/api/irrigation", async (req, res) => {
  const { device_id, water, dispenser1, dispenser2, dispenser3, dispenser4, dispenser5, created_at } = req.body;

  if (!device_id || water === undefined || dispenser1 === undefined || dispenser2 === undefined || dispenser3 === undefined || dispenser4 === undefined || dispenser5 === undefined) {
    return res.status(400).json({ success: false, message: "Missing fields." });
  }

  try {
    await userPool.query(
      `INSERT INTO irrigation_data (deviceid, water, dispenser1, dispenser2, dispenser3, dispenser4, dispenser5, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [device_id, water, dispenser1, dispenser2, dispenser3, dispenser4, dispenser5, created_at || new Date()]
    );

    res.json({ success: true, message: "Irrigation data added." });
  } catch (err) {
    console.error("❌ Error adding irrigation data:", err.message);
    res.status(500).json({ success: false, message: "Database error." });
  }
});

// ✅ ROTA: Buscar últimos dados de irrigação por device_id
app.get("/api/irrigation", async (req, res) => {
  const { device_id } = req.query;

  if (!device_id) {
    return res.status(400).json({ success: false, message: "Device ID is required." });
  }

  try {
    const result = await userPool.query(
      `SELECT created_at, water, dispenser1, dispenser2, dispenser3, dispenser4, dispenser5
       FROM irrigation_data 
       WHERE deviceid = $1 
       ORDER BY created_at DESC 
       LIMIT 30`,
      [device_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Error fetching irrigation data:", err.message);
    res.status(500).json({ success: false, message: "Database error." });
  }
});




// ✅ Inicia o servidor
app.listen(port, () => {
  console.log(`✅ Server2 is running on port ${port}`);
});
