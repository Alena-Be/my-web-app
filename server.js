require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');
const app = express();
const port = process.env.PORT || 3000;

const pool = require('./db');

app.use(express.static('public'));
app.use(express.json());

// Настройка сессий
app.use(session({
  store: new PgSession({
    pool: pool,
    tableName: 'session'
  }),
  secret: 'sline_secret_key_2025_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 день
    httpOnly: true
  }
}));

// ============ MIDDLEWARE ЗАЩИТЫ ============

// Только для авторизованных
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Требуется авторизация' });
}

// Только для администраторов
function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Доступ запрещён' });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Главная.html'));
});

app.get('/akcii', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Акции.html'));
});

app.get('/glavnaya', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Главная.html'));
});

app.get('/raspisanie', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Расписание.html'));
});

app.get('/lichniy-kabinet', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Личный кабинет.html'));
});

app.get('/otzyvy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Отзывы.html'));
});

app.get('/registraciya', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Регистрация.html'));
});

app.get('/stoimost', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Стоимость.html'));
});

app.get('/reviews-list.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reviews-list.html'));
});

app.get('/reviews-add.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reviews-add.html'));
});

app.get('/reviews-edit.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reviews-edit.html'));
});

app.get('/reviews-delete.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reviews-delete.html'));
});
// ============ API: ОТЗЫВЫ ============

// 1. Получить все отзывы
app.get('/api/reviews', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reviews ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении отзывов' });
  }
});

// Поиск + фильтрация + пагинация
app.get('/api/reviews/search', async (req, res) => {
  const { query, dateFrom, dateTo } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const offset = (page - 1) * limit;

  const conditions = [];
  const values = [];
  let idx = 1;

  if (query) {
    conditions.push(`(text ILIKE $${idx} OR name ILIKE $${idx})`);
    values.push(`%${query}%`);
    idx++;
  }

  if (dateFrom) {
    conditions.push(`created_at >= $${idx}`);
    values.push(dateFrom);
    idx++;
  }

  if (dateTo) {
    conditions.push(`created_at <= $${idx}`);
    values.push(dateTo);
    idx++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    // Данные для текущей страницы
    const dataResult = await pool.query(
      `SELECT * FROM reviews ${whereClause} ORDER BY id DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    );

    // Общее количество записей
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM reviews ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении данных' });
  }
});

// 3. Экспорт всех отзывов в Excel (ДО /:id)
app.get('/api/reviews/export/excel', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reviews ORDER BY id');
    const reviews = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Отзывы');

    worksheet.columns = [
      { header: 'ID',    key: 'id',         width: 8 },
      { header: 'Имя',   key: 'name',       width: 25 },
      { header: 'Отзыв', key: 'text',       width: 60 },
      { header: 'Дата',  key: 'created_at', width: 22 }
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5BB8CC' }
    };

    reviews.forEach(r => {
      worksheet.addRow({
        id: r.id,
        name: r.name,
        text: r.text,
        created_at: r.created_at ? new Date(r.created_at).toLocaleString('ru-RU') : ''
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="reviews.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Ошибка экспорта в Excel:', err);
    res.status(500).json({ error: 'Ошибка экспорта в Excel' });
  }
});

// 4. Экспорт отзывов в Excel с учётом фильтров (ДО /:id)
app.get('/api/reviews/export/excel/filtered', requireAuth, requireAdmin, async (req, res) => {
  const { query, dateFrom, dateTo } = req.query;

  const conditions = [];
  const values = [];
  let idx = 1;

  if (query) {
    conditions.push(`(text ILIKE $${idx} OR name ILIKE $${idx})`);
    values.push(`%${query}%`);
    idx++;
  }
  if (dateFrom) {
    conditions.push(`created_at >= $${idx}`);
    values.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`created_at <= $${idx}`);
    values.push(dateTo);
    idx++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const result = await pool.query(
      `SELECT * FROM reviews ${whereClause} ORDER BY id`,
      values
    );
    const reviews = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Отзывы (фильтр)');

    worksheet.columns = [
      { header: 'ID',    key: 'id',         width: 8 },
      { header: 'Имя',   key: 'name',       width: 25 },
      { header: 'Отзыв', key: 'text',       width: 60 },
      { header: 'Дата',  key: 'created_at', width: 22 }
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5BB8CC' }
    };

    reviews.forEach(r => {
      worksheet.addRow({
        id: r.id,
        name: r.name,
        text: r.text,
        created_at: r.created_at ? new Date(r.created_at).toLocaleString('ru-RU') : ''
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="reviews-filtered.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Ошибка экспорта в Excel:', err);
    res.status(500).json({ error: 'Ошибка экспорта в Excel' });
  }
});

// 5. Получить один отзыв по ID (ПОСЛЕ всех конкретных маршрутов)
app.get('/api/reviews/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query('SELECT * FROM reviews WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении отзыва' });
  }
});

// 6. Добавить новый отзыв
app.post('/api/reviews', async (req, res) => {
  const { name, text } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO reviews (name, text) VALUES ($1, $2) RETURNING *',
      [name, text]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при добавлении отзыва' });
  }
});

// 7. Обновить отзыв (только для админа)
app.put('/api/reviews/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { name, text } = req.body;

  if (!name || !text) {
    return res.status(400).json({ error: 'Заполните имя и текст' });
  }

  try {
    const result = await pool.query(
      'UPDATE reviews SET name = $1, text = $2 WHERE id = $3 RETURNING *',
      [name, text, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при обновлении отзыва' });
  }
});

// 8. Удалить отзыв (только для админа)
app.delete('/api/reviews/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id;

  try {
    const result = await pool.query(
      'DELETE FROM reviews WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    res.json({ message: 'Отзыв удалён', id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при удалении отзыва' });
  }
});

// Экспорт всех отзывов в Excel
app.get('/api/reviews/export/excel', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reviews ORDER BY id');
    const reviews = result.rows;

    // Создаём книгу
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Отзывы');

    // Колонки
    worksheet.columns = [
      { header: 'ID',    key: 'id',         width: 8 },
      { header: 'Имя',   key: 'name',       width: 25 },
      { header: 'Отзыв', key: 'text',       width: 60 },
      { header: 'Дата',  key: 'created_at', width: 22 }
    ];

    // Стилизуем заголовки
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5BB8CC' }  // твой нежно-голубой
    };

    // Строки
    reviews.forEach(r => {
      worksheet.addRow({
        id: r.id,
        name: r.name,
        text: r.text,
        created_at: r.created_at ? new Date(r.created_at).toLocaleString('ru-RU') : ''
      });
    });

    // Заголовки ответа для скачивания
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="reviews.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Ошибка экспорта в Excel:', err);
    res.status(500).json({ error: 'Ошибка экспорта в Excel' });
  }
});

// Экспорт отзывов в Excel с учётом фильтров
app.get('/api/reviews/export/excel/filtered', requireAuth, requireAdmin, async (req, res) => {
  const { query, dateFrom, dateTo } = req.query;

  const conditions = [];
  const values = [];
  let idx = 1;

  if (query) {
    conditions.push(`(text ILIKE $${idx} OR name ILIKE $${idx})`);
    values.push(`%${query}%`);
    idx++;
  }
  if (dateFrom) {
    conditions.push(`created_at >= $${idx}`);
    values.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`created_at <= $${idx}`);
    values.push(dateTo);
    idx++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const result = await pool.query(
      `SELECT * FROM reviews ${whereClause} ORDER BY id`,
      values
    );
    const reviews = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Отзывы (фильтр)');

    worksheet.columns = [
      { header: 'ID',    key: 'id',         width: 8 },
      { header: 'Имя',   key: 'name',       width: 25 },
      { header: 'Отзыв', key: 'text',       width: 60 },
      { header: 'Дата',  key: 'created_at', width: 22 }
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5BB8CC' }
    };

    reviews.forEach(r => {
      worksheet.addRow({
        id: r.id,
        name: r.name,
        text: r.text,
        created_at: r.created_at ? new Date(r.created_at).toLocaleString('ru-RU') : ''
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="reviews-filtered.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Ошибка экспорта в Excel:', err);
    res.status(500).json({ error: 'Ошибка экспорта в Excel' });
  }
});

// ============ АВТОРИЗАЦИЯ ============

// Регистрация
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }

  try {
    // Проверяем, что email свободен
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email уже занят' });
    }

    // Хэшируем пароль
    const password_hash = await bcrypt.hash(password, 10);

    // Получаем id роли 'user'
    const roleResult = await pool.query("SELECT id FROM roles WHERE name = 'user'");
    const role_id = roleResult.rows[0].id;

    // Создаём пользователя
    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone`,
      [name, email, phone || null, password_hash, role_id]
    );

    res.status(201).json({ message: 'Регистрация успешна', user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при регистрации' });
  }
});

// Вход
app.post('/api/vhod', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }

  try {
    // Ищем пользователя по email + подтягиваем имя роли
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.password_hash, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const user = result.rows[0];

    // Сравниваем пароль с хэшем
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Сохраняем пользователя в сессии
    req.session.userId = user.id;
    req.session.role = user.role;

    res.json({
      message: 'Вход выполнен',
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при входе' });
  }
});

// Выход
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Ошибка при выходе' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Вы вышли из системы' });
  });
});

// Текущий пользователь
app.get('/api/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Не авторизован' });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении данных' });
  }
});

// Пример: админ-панель (только для админов)
app.get('/admin/products', requireAuth, requireAdmin, async (req, res) => {
  res.json({ message: 'Добро пожаловать в админ-панель', user: req.session.userId });
});

app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
});

// Файл проверен и загружен в GitHub
