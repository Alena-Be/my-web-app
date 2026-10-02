// app.js — общая клиентская логика.
// Регистрация:     в Регистрация.html
// Вход:            в vhod.html
// Выход:           через #authBlock
// Отзывы:          в Отзывы.html
// Профиль:         здесь (для lichniy-kabinet)

(function () {
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const load = (k, def = null) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  };

  // ============ АВАТАР (локально, для вида) ============
  const avatarImg = document.getElementById('avatar-placeholder-img');
  const avatarInput = document.getElementById('avatarInput');
  const avatarBtn = document.getElementById('avatarBtn');

  const savedAvatar = load('sl_avatar', null);
  if (avatarImg && savedAvatar) {
    avatarImg.src = savedAvatar;
  }

  on(avatarBtn, 'click', () => {
    const input = document.getElementById('avatarInput');
    if (input) input.click();
  });

  on(avatarInput, 'change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (avatarImg) avatarImg.src = dataUrl;
      save('sl_avatar', dataUrl);
    };
    reader.readAsDataURL(file);
  });

  // ============ ЛИЧНЫЙ КАБИНЕТ ============
  // Проверяем по классу страницы: у тебя .lichniy-kabinet-container
  const isProfilePage =
    document.querySelector('.lichniy-kabinet-container') !== null ||
    document.querySelector('.dashboard-container') !== null;

  if (isProfilePage) {
    document.addEventListener('DOMContentLoaded', () => {
      // Загрузка профиля с сервера
      const loadUserProfile = async () => {
        try {
          const response = await fetch('/api/me', {
            method: 'GET',
            credentials: 'include'
          });

          if (!response.ok) return;

          const userData = await response.json();

          const nameEl = document.getElementById('profileName');
          if (nameEl) nameEl.textContent = userData.name || '';

          const phoneEl = document.getElementById('user-phone');
          if (phoneEl) phoneEl.textContent = userData.phone || '';

          const nameInput = document.getElementById('profileNameInput');
          if (nameInput) nameInput.value = userData.name || '';

          const phoneInput = document.getElementById('profilePhoneInput');
          if (phoneInput) phoneInput.value = userData.phone || '';

          const emailInput = document.getElementById('profileEmailInput');
          if (emailInput) emailInput.value = userData.email || '';
        } catch (err) {
          console.error('Ошибка при загрузке профиля:', err);
        }
      };

      loadUserProfile();

      // Кнопки редактирования
      const editProfileBtn = document.getElementById('editProfileBtn');
      const saveProfileBtn = document.getElementById('saveProfileBtn');
      const cancelEditBtn = document.getElementById('cancelEditBtn');
      const deleteAccountBtn = document.getElementById('deleteAccountBtn');

      const userInfoDisplay = document.getElementById('profileInfo');
      const editProfileForm = document.getElementById('edit-profile-form');

      const enterEditMode = () => {
        if (userInfoDisplay) userInfoDisplay.style.display = 'none';
        if (editProfileForm) editProfileForm.style.display = 'block';
        if (editProfileBtn) editProfileBtn.style.display = 'none';
        if (saveProfileBtn) saveProfileBtn.style.display = 'inline-block';
        if (cancelEditBtn) cancelEditBtn.style.display = 'inline-block';
      };

      const exitEditMode = () => {
        if (userInfoDisplay) userInfoDisplay.style.display = 'block';
        if (editProfileForm) editProfileForm.style.display = 'none';
        if (editProfileBtn) editProfileBtn.style.display = 'inline-block';
        if (saveProfileBtn) saveProfileBtn.style.display = 'none';
        if (cancelEditBtn) cancelEditBtn.style.display = 'none';
      };

      on(editProfileBtn, 'click', enterEditMode);
      on(cancelEditBtn, 'click', exitEditMode);

      // Сохранение профиля (локально, для вида)
      on(editProfileForm, 'submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('profileNameInput').value.trim();
        const email = document.getElementById('profileEmailInput').value.trim();
        const phone = document.getElementById('profilePhoneInput').value.trim();

        const nameEl = document.getElementById('profileName');
        if (nameEl) nameEl.textContent = name;

        const phoneEl = document.getElementById('user-phone');
        if (phoneEl) phoneEl.textContent = phone;

        localStorage.setItem('userName', name);
        localStorage.setItem('userPhone', phone);
        localStorage.setItem('userEmail', email);

        exitEditMode();
      });

      // Удаление аккаунта (локально)
      on(deleteAccountBtn, 'click', () => {
        if (!confirm('Вы уверены, что хотите удалить аккаунт? Это действие необратимо.')) return;
        localStorage.removeItem('sl_profile');
        localStorage.removeItem('sl_avatar');
        localStorage.removeItem('userName');
        localStorage.removeItem('userPhone');
        localStorage.removeItem('userEmail');
        window.location.href = '/';
      });
    });
  }

  // ============ БЛОК АВТОРИЗАЦИИ В ШАПКЕ ============
  const authBlock = document.getElementById('authBlock');

  async function renderAuthBlock() {
    if (!authBlock) return;

    try {
      const res = await fetch('/api/me', { credentials: 'include' });

      if (res.ok) {
        const user = await res.json();
        authBlock.innerHTML = `
          <a href="/lichniy-kabinet" class="auth-user">${user.name}</a>
          <button id="logoutBtn" class="btn btn-outline">Выйти</button>
        `;

        document.getElementById('logoutBtn').addEventListener('click', async () => {
          try {
            await fetch('/api/logout', {
              method: 'POST',
              credentials: 'include'
            });
            window.location.href = '/';
          } catch (err) {
            console.error('Ошибка при выходе:', err);
          }
        });
      } else {
        authBlock.innerHTML = `
          <a href="/vhod.html" class="btn btn-outline">Войти</a>
        `;
      }
    } catch (err) {
      console.error('Ошибка при проверке авторизации:', err);
      authBlock.innerHTML = `
        <a href="/vhod.html" class="btn btn-outline">Войти</a>
      `;
    }
  }

  // ============ АДМИН-КНОПКИ ============
  async function renderActionButtons() {
    const actionButtons = document.getElementById('actionButtons');
    const adminPanelLink = document.getElementById('adminPanelLink');

    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (!res.ok) return;

      const user = await res.json();
      if (user.role !== 'admin') return;

      // Показать ссылку на управление отзывами (если мы на странице отзывов)
      if (adminPanelLink) {
        adminPanelLink.style.display = 'block';
      }

      // Заполнить блок админ-кнопок (если он есть на этой странице)
      if (actionButtons) {
        actionButtons.innerHTML = `
          <a href="/admin/products" class="btn btn-primary">Админ-панель</a>
          <a href="/reviews-list.html" class="btn btn-secondary">Управление отзывами</a>
        `;
      }
    } catch (err) {
      console.error('Ошибка при загрузке админ-кнопок:', err);
    }
  }

  // ============ ЗАПУСК ============
  document.addEventListener('DOMContentLoaded', () => {
    renderAuthBlock();
    renderActionButtons();
  });
})();