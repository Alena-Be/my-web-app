const express = require('express');
const pool = require('./assets/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));
// Раздача статических файлов из папки uploads
app.use('/uploads', express.static('uploads'));

// Регистрация пользователя
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password } = req.body;

  try {
    // 1. Хешируем пароль
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 2. Сохраняем пользователя в БД
    const newUserQuery = `
      INSERT INTO users (name, email, phone, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, created_at;
    `;
    const values = [name, email, phone, password_hash];
    
    const { rows } = await pool.query(newUserQuery, values);

    console.log('Пользователь успешно зарегистрирован:', rows[0]);
    res.status(201).json({ success: true, user: rows[0] });

  } catch (err) {
    // 3. Гарантированно ловим и выводим ошибку
    console.error('ОШИБКА ПРИ РЕГИСТРАЦИИ (async/await):', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// Вход пользователя
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Проверяем, что email и password предоставлены
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email и пароль обязательны для входа' 
      });
    }

    // Находим пользователя по email
    const result = await pool.query(
      'SELECT id, name, email, phone, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Неверный email или пароль' 
      });
    }

    const user = result.rows[0];

    // Сравниваем пароль
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Неверный email или пароль' 
      });
    }

    // Создаем JWT-токен
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Устанавливаем токен в httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Использовать secure флаг в продакшене
      maxAge: 24 * 60 * 60 * 1000, // 24 часа
      sameSite: 'strict'
    });

    // Возвращаем данные пользователя (без password_hash)
    const { password_hash: _, ...userData } = user;
    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Ошибка при входе:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Внутренняя ошибка сервера при входе пользователя' 
    });
  }
});

// Выход пользователя
app.post('/api/logout', (req, res) => {
  try {
    // Очищаем cookie с токеном
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.status(200).json({ 
      success: true, 
      message: 'Выход выполнен успешно' 
    });
  } catch (error) {
    console.error('Ошибка при выходе:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Внутренняя ошибка сервера при выходе пользователя' 
    });
  }
});

// Middleware для аутентификации
const authenticateToken = (req, res, next) => {
  console.log('Cookies:', req.cookies);
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Требуется токен аутентификации'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({
        success: false,
        error: 'Невалидный токен аутентификации'
      });
    }

    req.user = { id: user.userId };
    next();
  });
};

// Получение расписания занятий
app.get('/api/schedule', async (req, res) => {
  try {
    const query = `
      SELECT
        ss.id,
        ss.start_time,
        ss.end_time,
        ct.name AS class_name,
        ct.description AS class_description,
        i.name AS instructor_name
      FROM schedule_slots ss
      JOIN class_types ct ON ss.class_type_id = ct.id
      JOIN instructors i ON ss.instructor_id = i.id
      ORDER BY ss.start_time
    `;

    const result = await pool.query(query);
    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Ошибка при получении расписания:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера при получении расписания'
    });
  }
});

// Создание записи на занятие
app.post('/api/bookings', authenticateToken, async (req, res) => {
  try {
    const { schedule_slot_id } = req.body;
    const user_id = req.user.id;

    if (!schedule_slot_id) {
      return res.status(400).json({
        success: false,
        error: 'ID слота расписания обязателен для записи'
      });
    }

    // Проверяем, что слот существует
    const slotResult = await pool.query(
      'SELECT id FROM schedule_slots WHERE id = $1',
      [schedule_slot_id]
    );

    if (slotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Указанный слот расписания не существует'
      });
    }

    // Создаем запись
    const bookingResult = await pool.query(
      'INSERT INTO bookings (user_id, schedule_slot_id) VALUES ($1, $2) RETURNING id, user_id, schedule_slot_id, created_at',
      [user_id, schedule_slot_id]
    );

    res.status(201).json({
      success: true,
      data: bookingResult.rows[0]
    });
  } catch (error) {
    console.error('Ошибка при создании записи:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера при создании записи'
    });
  }
});

// Отмена записи на занятие
app.delete('/api/bookings/:bookingId', authenticateToken, async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    const user_id = req.user.id;

    if (isNaN(bookingId)) {
      return res.status(400).json({
        success: false,
        error: 'Невалидный ID записи'
      });
    }

    // Проверяем, что запись существует и принадлежит пользователю
    const bookingResult = await pool.query(
      'SELECT user_id FROM bookings WHERE id = $1',
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Запись не найдена'
      });
    }

    if (bookingResult.rows[0].user_id !== user_id) {
      return res.status(403).json({
        success: false,
        error: 'Нет прав для отмены этой записи'
      });
    }

    // Удаляем запись
    await pool.query(
      'DELETE FROM bookings WHERE id = $1',
      [bookingId]
    );

    res.status(200).json({
      success: true,
      message: 'Запись успешно отменена'
    });
  } catch (error) {
    console.error('Ошибка при отмене записи:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера при отмене записи'
    });
  }
});

// Получение записей пользователя
app.get('/api/my-bookings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT
        b.id AS booking_id,
        b.created_at AS booking_date,
        ss.start_time,
        ss.end_time,
        ct.name AS class_name,
        ct.description AS class_description,
        i.name AS instructor_name
      FROM bookings b
      JOIN schedule_slots ss ON b.schedule_slot_id = ss.id
      JOIN class_types ct ON ss.class_type_id = ct.id
      JOIN instructors i ON ss.instructor_id = i.id
      WHERE b.user_id = $1
      ORDER BY ss.start_time
    `;

    const result = await pool.query(query, [userId]);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Ошибка при получении записей пользователя:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера при получении записей'
    });
  }
});
// Получение профиля пользователя
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    // Получаем информацию о пользователе по ID из токена
    const result = await pool.query(
      'SELECT id, name, phone FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка при получении профиля:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера при получении профиля'
    });
  }
});

// Проверка аутентификации пользователя
app.get('/api/check-auth', authenticateToken, async (req, res) => {
  try {
    // Получаем информацию о пользователе по ID из токена
    const result = await pool.query(
      'SELECT id, name, email, phone FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка при проверке аутентификации:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера при проверке аутентификации'
    });
  }
});

// Редактирование профиля пользователя
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, phone } = req.body;

    // Проверяем, что хотя бы одно поле для обновления передано
    if (!name && !email && !phone) {
      return res.status(400).json({
        success: false,
        error: 'Необходимо указать хотя бы одно поле для обновления (name, email, phone)'
      });
    }

    // Формируем динамический SQL-запрос
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }

    if (email !== undefined) {
      fields.push(`email = $${paramIndex}`);
      values.push(email);
      paramIndex++;
    }

    if (phone !== undefined) {
      fields.push(`phone = $${paramIndex}`);
      values.push(phone);
      paramIndex++;
    }

    // Добавляем ID пользователя в конец значений
    values.push(userId);

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, email, phone`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка при обновлении профиля:', error);

    // Проверяем, является ли ошибка дубликатом уникального ключа
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        error: 'Пользователь с таким email или телефоном уже существует'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера при обновлении профиля'
    });
  }
});


// Загрузка аватара пользователя
app.post('/api/users/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    const userId = req.user.id;
    const avatarPath = req.file.path;

    // Обновляем поле photo_url в таблице users
    const result = await pool.query(
      'UPDATE users SET photo_url = $1 WHERE id = $2 RETURNING id, name, email, phone, photo_url',
      [avatarPath, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        avatar_path: avatarPath
      }
    });
  } catch (error) {
    console.error('Ошибка при загрузке аватара:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера при загрузке аватара'
    });
  }
});


// Удаление профиля пользователя
app.delete('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Выполняем SQL-запрос DELETE FROM users WHERE id = $1
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1',
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    // Очищаем cookie с токеном
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.status(200).json({
      success: true,
      message: 'Профиль пользователя успешно удален'
    });
  } catch (err) {
    console.error('ОШИБКА ПРИ УДАЛЕНИИ ПРОФИЛЯ:', err);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

module.exports = app;