const pool = require('./assets/db');

async function checkTableStructure() {
  try {
    console.log('Проверка структуры таблицы users...');
    
    // Получаем информацию о столбцах таблицы users
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);
    
    console.log('Структура таблицы users:');
    result.rows.forEach((column, index) => {
      console.log(`${index + 1}. ${column.column_name}: ${column.data_type} (${column.is_nullable})`);
    });
    
    // Закрываем соединение
    await pool.end();
    console.log('Соединение с базой данных закрыто.');
  } catch (error) {
    console.error('Ошибка при проверке структуры таблицы:', error.message);
  }
}

checkTableStructure();