import os
import shutil
import json
from core.config import DOCS_DIR, BASE_DIR

WELCOME_CONTENT = """# MarkFlow: Полная демонстрация возможностей

Этот файл содержит примеры всех поддерживаемых элементов оформления в MarkFlow, включая стандартный Markdown и кастомные расширения.

---

## 1. Заголовки (Headings)

# Заголовок 1
## Заголовок 2
### Заголовок 3
#### Заголовок 4
##### Заголовок 5
###### Заголовок 6

---

## 2. Текст и форматирование

**Жирный текст** и __еще один вариант__.
*Курсив* и _еще один вариант_.
~~Зачеркнутый текст~~.
`Инлайновый код` и [Ссылка на сайт](https://google.com).

> Это стандартная цитата (Blockquote).
> Она может содержать **жирный текст** или другие элементы.

---

## 3. Списки и задачи

### Обычные списки
- Элемент 1
- Элемент 2
  - Вложенный элемент
  - Еще один

### Нумерованные списки
1. Первый
2. Второй
3. Третий

### Списки задач (Task Lists)
- [x] Выполненная задача
- [ ] Ожидающая задача
- [x] Еще одна готовая задача

---

## 4. Таблицы

| Имя | Роль | Статус |
| :--- | :---: | ---: |
| **Admin** | Owner | `Active` |
| User | Guest | *Offline* |
| Developer | Maintainer | `Standby` |

---

## 5. Код и Диаграммы

### Подсветка синтаксиса
```python
def hello_markflow():
    print("Welcome to the premium documentation engine!")
    
for i in range(3):
    hello_markflow()
```

### Mermaid (Диаграммы)
```mermaid
graph TD
    A[Идея] --> B{Работает?}
    B -- Да --> C[Радость]
    B -- Нет --> D[Отладка]
    D --> B
```

---

## 6. Математические формулы (KaTeX)

Инлайновая формула: $E = mc^2$

Блочная формула:
$$
\phi = \frac{1+\sqrt{5}}{2} \approx 1.618
$$

---

## 7. Колл-ауты (Alerts/Callouts)

> [!NOTE]
> Это стандартная заметка для общей информации.

> [!TIP]
> Полезный совет или лайфхак.

> [!IMPORTANT]
> Важная информация, которую не стоит пропускать.

> [!WARNING]
> Предупреждение о возможных проблемах.

> [!CAUTION]
> Осторожно! Высокий риск или критическое действие.

---

## 8. Вкладки (Tabs)

@tabs
@tab 🐍 Python
```python
print("Hello from Python")
```
@tab 📜 JS
```javascript
console.log("Hello from JS");
```
@tab 🦀 Rust
```rust
println!("Hello from Rust");
```
@endtabs

---

## 9. Выпадающие списки (Dropdowns/Accordions)

@dropdown Нажми, чтобы раскрыть подробности
Здесь может быть любой контент, который вы хотите скрыть по умолчанию.

- Пункт 1
- Пункт 2

```sql
SELECT * FROM secrets WHERE id = 1;
```
@enddropdown

---

## 10. Сложная вложенность (Stress Test)

@dropdown Раскрой меня для вложенных тестов
Внутри этого выпадающего списка находятся вкладки:

@tabs
@tab 💡 Советы
> [!TIP]
> Используйте вложенность с умом для структурирования документации.
@tab 📊 Данные
| Ключ | Значение |
| --- | --- |
| Версия | 4.0 |
@endtabs

А ниже — Mermaid график прямо внутри аккордеона:

```mermaid
pie title Распределение задач
    "Разработка" : 40
    "Тестирование" : 25
    "Документация" : 35
```
const markFlow = {
  engine: 'Marked.js',
  style: 'Vanilla CSS',
  backend: 'FastAPI',
  frontend: 'Modular JS'
};
console.log("Ready to scale!");
```
@endtabs

---

## 📊 Интерактивные элементы

Вы можете вставлять сложные диаграммы и математические формулы, которые отрендерятся прямо в браузере.

@dropdown Нажми, чтобы увидеть Mermaid диаграмму и формулы
### Схема работы
```mermaid
graph LR
    A[Markdown] --> B{MarkFlow}
    B --> C[HTML]
    B --> D[PDF]
    B --> E[Mobile]
    
    style B fill:#6366f1,stroke:#fff,stroke-width:2px,color:#fff
```

### Математика (KaTeX)
Формула нормального распределения:
$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{1}{2}\left(\frac{x-\mu}{\sigma}\right)^2}
$$
@enddropdown

---

## 📝 Задачи и Статусы

Поддерживаются списки задач и наглядные таблицы:

- [x] Развернуть MarkFlow в Docker
- [x] Настроить Git-репозиторий
- [ ] Написать первую статью
- [ ] Пригласить команду

| Модуль | Статус | Приоритет |
| :--- | :---: | ---: |
| **Viewer** | `Ready` | High |
| **Editor** | `Active` | High |
| **Search** | `Beta` | Medium |

> [!TIP]
> Нажмите иконку **карандаша** в верхней панели, чтобы отредактировать этот текст и настроить главную страницу под свои нужды.

---
*Сделано с любовью для эффективных команд.*
"""

DEFAULT_SECURITY = {
    "login": "5/minute",
    "2fa_verify": "5/minute",
    "change_password": "3/minute",
    "create_user": "10/minute",
    "file_ops": "60/minute",
    "search": "30/minute"
}

def initialize_volumes():
    # 1. Initialize Docs
    if not os.path.exists(DOCS_DIR):
        os.makedirs(DOCS_DIR, exist_ok=True)
    
    md_files = [f for f in os.listdir(DOCS_DIR) if f.endswith('.md')]
    if not md_files:
        with open(os.path.join(DOCS_DIR, "Welcome.md"), "w", encoding="utf-8") as f:
            f.write(WELCOME_CONTENT)
            
    # 2. Initialize Config and Settings
    config_dir = os.path.join(os.path.dirname(BASE_DIR), "config")
    example_dir = os.path.join(BASE_DIR, "config_example")
    
    if not os.path.exists(config_dir):
        os.makedirs(config_dir, exist_ok=True)
        
    # Copy from example if file is missing in config
    for item in os.listdir(example_dir):
        s = os.path.join(example_dir, item)
        d = os.path.join(config_dir, item)
        if os.path.isdir(s):
            if not os.path.exists(d):
                shutil.copytree(s, d)
        else:
            if not os.path.exists(d):
                shutil.copy2(s, d)
                
    # 3. Initialize Home Page
    home_md = os.path.join(config_dir, "home.md")
    if not os.path.exists(home_md):
        with open(home_md, "w", encoding="utf-8") as f:
            f.write(WELCOME_CONTENT)
