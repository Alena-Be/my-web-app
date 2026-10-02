const pool = require('./assets/db');

async function testConnection() {
  try {
    console.log('Попытка подключения к базе данных...');
    
    // Тестовый запрос для проверки подключения
    const result = await pool.query('SELECT NOW()');
    console.log('Подключение к базе данных успешно:', result.rows[0]);
    
    // Проверим, существует ли таблица users
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    console.log('Таблица users существует:', tableCheck.rows[0].exists);
    
    if (!tableCheck.rows[0].exists) {
      console.log('Таблица users не найдена в базе данных. Создайте таблицу перед использованием API.');
    }
    
    // Закрываем соединение
    await pool.end();
    console.log('Соединение с базой данных закрыто.');
  } catch (error) {
    console.error('Ошибка при подключении к базе данных:', error.message);
  }
}

testConnection();