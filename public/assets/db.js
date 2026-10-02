const { Pool } = require('pg');

// Конфигурация пула соединений с базой данных PostgreSQL
// Используются переменные окружения для безопасного хранения учетных данных
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',          // Пользователь базы данных
  host: process.env.DB_HOST || 'localhost',       // Хост базы данных
  database: process.env.DB_NAME || 'yoga',        // Имя базы данных
  password: String(process.env.DB_PASSWORD || '7897'),  // Пароль пользователя (гарантированно строка)
  port: parseInt(process.env.DB_PORT) || 5432,    // Порт подключения (по умолчанию 5432)
});

module.exports = pool;