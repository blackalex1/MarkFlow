#!/usr/bin/env bash
# ==============================================================================
# 🌊 MarkFlow Universal Updater - Master Launcher
# High-reliability updater with Git sync, auto-bootstrap, Docker rebuild & cleanup
# ==============================================================================

set -eo pipefail

# Text formatting & Colors
BOLD="\033[1m"
DIM="\033[2m"
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
MAGENTA="\033[0;35m"
CYAN="\033[0;36m"
WHITE="\033[1;37m"
RESET="\033[0m"

log_step() {
    local step="$1"
    local total="$2"
    local title="$3"
    echo -e "\n${BOLD}${CYAN}━━━ [${step}/${total}] ${WHITE}${title} ${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

log_info() {
    echo -e "  ${BLUE}ℹ${RESET} $1"
}

log_success() {
    echo -e "  ${GREEN}✔${RESET} $1"
}

log_warn() {
    echo -e "  ${YELLOW}⚠${RESET} $1"
}

log_error() {
    echo -e "  ${RED}✖${RESET} $1"
}

log_banner() {
    echo -e "\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${CYAN}║                    🌊 MARKFLOW UNIVERSAL UPDATER                     ║${RESET}"
    echo -e "${BOLD}${CYAN}║             Автоматизированный установщик и менеджер обновлений       ║${RESET}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════╝${RESET}\n"
}

# Resolve project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse Command-Line Flags
AUTO_MODE=0
SKIP_DOCKER=0
SKIP_GIT=0
NO_CACHE=1

show_help() {
    echo "Использование: ./update.sh [ОПЦИИ]"
    echo ""
    echo "Опции:"
    echo "  -y, --yes, --auto   Не запрашивать подтверждения, неинтерактивный режим"
    echo "  --skip-git          Пропустить обновление исходного кода Git"
    echo "  --skip-docker       Пропустить пересборку и перезапуск Docker"
    echo "  --cache             Использовать Docker build кэш (по умолчанию: --no-cache)"
    echo "  -h, --help          Показать эту справку"
    echo ""
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -y|--yes|--auto)
            AUTO_MODE=1
            shift
            ;;
        --skip-git)
            SKIP_GIT=1
            shift
            ;;
        --skip-docker)
            SKIP_DOCKER=1
            shift
            ;;
        --cache)
            NO_CACHE=0
            shift
            ;;
        --bootstrapped)
            BOOTSTRAPPED=1
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            log_warn "Неизвестный параметр: $1 (будет проигнорирован)"
            shift
            ;;
    esac
done

log_banner

# Step 1: Environment & Permissions Check
log_step 1 6 "Проверка системного окружения и прав доступа"

# 1.1 Check Docker daemon accessibility
if [ "$SKIP_DOCKER" -eq 0 ]; then
    if ! command -v docker &>/dev/null; then
        log_error "Docker не установлен на этой системе. Пожалуйста, установите Docker."
        exit 1
    fi

    if ! docker info >/dev/null 2>&1; then
        log_error "Нет доступа к демону Docker. Запустите скрипт через sudo: ${BOLD}sudo ./update.sh${RESET}"
        exit 1
    fi

    # Detect Docker Compose command
    if docker compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE="docker compose"
        log_info "Обнаружен Docker Compose v2: ${BOLD}$(docker compose version --short 2>/dev/null || echo 'v2')${RESET}"
    elif command -v docker-compose &>/dev/null; then
        DOCKER_COMPOSE="docker-compose"
        log_info "Обнаружен Docker Compose v1: ${BOLD}$(docker-compose version --short 2>/dev/null || echo 'v1')${RESET}"
    else
        log_error "Docker Compose не найден. Установите docker compose плагин."
        exit 1
    fi
fi

# 1.2 Check .env file
if [ ! -f ".env" ]; then
    log_error "Файл конфигурации ${BOLD}.env${RESET} не найден в корне проекта."
    log_info "Пожалуйста, сначала выполните первоначальную установку: ${BOLD}bash deploy/setup.sh${RESET}"
    exit 1
fi
log_success "Файл конфигурации .env обнаружен и готов к использованию."

# Step 2: Git Codebase Sync & Self-Update Bootstrap
log_step 2 6 "Синхронизация кодовой базы Git и самообновление"

if [ "$SKIP_GIT" -eq 0 ] && [ -d ".git" ] && command -v git &>/dev/null; then
    # Git security and non-interactive environment
    git config --global --add safe.directory "$SCRIPT_DIR" 2>/dev/null || true
    git config --global --add safe.directory "*" 2>/dev/null || true
    export GIT_TERMINAL_PROMPT=0
    export GIT_ASKPASS=""

    OLD_HEAD=$(git rev-parse HEAD 2>/dev/null || true)
    log_info "Текущая ревизия проекта: ${BOLD}${OLD_HEAD:0:7}${RESET}"

    # Stash uncommitted changes safely
    STASHED=0
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        log_warn "Обнаружены локальные незакоммиченные изменения. Сохранение во временный stash..."
        git stash push -m "markflow-updater-autostash-$(date +%s)" --quiet 2>/dev/null || true
        STASHED=1
    fi

    # Multi-mirror fallback list
    REMOTES=("origin" "https://github.com/blackalex1/MarkFlow.git" "https://gh-proxy.com/https://github.com/blackalex1/MarkFlow.git" "https://ghfast.top/https://github.com/blackalex1/MarkFlow.git")
    FETCH_SUCCESS=0

    for remote in "${REMOTES[@]}"; do
        log_info "Запрос обновлений из: ${DIM}${remote}${RESET}..."
        if timeout 15 git -c "safe.directory=*" -c "core.askPass=true" fetch "$remote" main --quiet 2>/dev/null; then
            FETCH_SUCCESS=1
            log_success "Связь с репозиторием успешна (${remote})."
            break
        else
            log_warn "Не удалось подключиться к ${remote}, пробуем следующее зеркало..."
        fi
    done

    if [ "$FETCH_SUCCESS" -eq 1 ]; then
        # Fast-forward to fetched HEAD
        git reset --hard FETCH_HEAD --quiet 2>/dev/null || true
        NEW_HEAD=$(git rev-parse HEAD 2>/dev/null || true)

        if [ -n "$OLD_HEAD" ] && [ -n "$NEW_HEAD" ] && [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
            log_success "Кодовая база успешно обновлена: ${BOLD}${OLD_HEAD:0:7} → ${NEW_HEAD:0:7}${RESET}"
            
            # Display beautiful changelog
            echo -e "\n  ${BOLD}${YELLOW}📋 Новые коммиты и изменения:${RESET}"
            git log --graph --pretty=format:'    %C(yellow)%h%Creset %C(bold white)%s%Creset %C(dim green)(%cr)%Creset %C(cyan)<%an>%Creset' -n 10 "${OLD_HEAD}..${NEW_HEAD}" 2>/dev/null || true
            echo ""

            # Check if update.sh itself was updated and re-execute
            if [ -z "${BOOTSTRAPPED:-}" ]; then
                log_info "Скрипт обновления был обновлен из репозитория. Бесшовный перезапуск..."
                export BOOTSTRAPPED=1
                exec bash "$0" "$@" --bootstrapped
            fi
        else
            log_success "Кодовая база уже находится в актуальном состоянии (Up to date)."
        fi
    else
        log_warn "Не удалось связаться с GitHub или его зеркалами. Продолжаем обновление на текущей кодовой базе..."
    fi

    # Restore stashed changes if any
    if [ "$STASHED" -eq 1 ]; then
        log_info "Восстановление локальных изменений из stash..."
        git stash pop --quiet 2>/dev/null || true
    fi
else
    log_info "Шаг Git пропущен (--skip-git или .git не найден)."
fi

# Step 3: Configuration & Nginx Sync
log_step 3 6 "Синхронизация конфигураций и Nginx"

# Parse and clean .env variables
while IFS='=' read -r key value || [ -n "$key" ]; do
    [[ $key =~ ^#.* ]] && continue
    [[ -z $key ]] && continue
    clean_val=$(echo "$value" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')
    export "$key"="$clean_val"
done < ".env"

log_info "Привязано доменное имя: ${BOLD}${DOMAIN_NAME:-localhost}${RESET} (Порты: HTTP=${HTTP_PORT:-80}, HTTPS=${HTTPS_PORT:-443})"

# Regenerate nginx.conf from template
if [ -f "deploy/nginx.conf.template" ]; then
    log_info "Регенерация deploy/nginx.conf из шаблона..."
    cp deploy/nginx.conf.template deploy/nginx.conf
    sed -i "s/{{DOMAIN_NAME}}/${DOMAIN_NAME}/g" deploy/nginx.conf
    sed -i "s/{{HTTPS_PORT}}/${HTTPS_PORT:-443}/g" deploy/nginx.conf
    log_success "Конфигурация Nginx синхронизирована."
fi

# Ensure required runtime volumes/folders exist on host
mkdir -p certbot/conf certbot/www config markdown_docs

# Step 4: Docker Containers Build & Restart
log_step 4 6 "Пересборка и запуск Docker-контейнеров"

if [ "$SKIP_DOCKER" -eq 0 ]; then
    cd deploy
    
    BUILD_OPTS=("--pull")
    if [ "$NO_CACHE" -eq 1 ]; then
        BUILD_OPTS+=("--no-cache")
        log_info "Сборка контейнеров с флагом ${BOLD}--no-cache${RESET} для гарантии применения обновлений..."
    else
        log_info "Сборка контейнеров с использованием Docker кэша..."
    fi

    # Build containers
    if $DOCKER_COMPOSE --env-file ../.env build "${BUILD_OPTS[@]}"; then
        log_success "Образы Docker успешно собраны."
    else
        log_error "Ошибка при сборке образов Docker! Обновление прервано."
        cd ..
        exit 1
    fi

    # Restart services
    log_info "Перезапуск сервисов MarkFlow и Nginx..."
    $DOCKER_COMPOSE --env-file ../.env up -d --remove-orphans
    
    # Reload Nginx inside running proxy container
    log_info "Плавная перезагрузка конфигурации Nginx..."
    $DOCKER_COMPOSE --env-file ../.env exec -T nginx nginx -s reload 2>/dev/null || true
    
    cd ..
    log_success "Контейнеры MarkFlow и Nginx успешно запущены."
else
    log_info "Шаг Docker пропущен (--skip-docker)."
fi

# Step 5: Artifact & Cache Cleanup
log_step 5 6 "Очистка временных файлов и старых Docker-образов"

# Clean dangling Docker images and build caches
if [ "$SKIP_DOCKER" -eq 0 ]; then
    log_info "Удаление старых неиспользуемых слоев и образов Docker..."
    docker image prune -f >/dev/null 2>&1 || true
    log_success "Очистка Docker завершена."
fi

# Clean local python cache artifacts
log_info "Очистка локальных кэшей Python (__pycache__, .pytest_cache)..."
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true
find . -type f -name "*.pyo" -delete 2>/dev/null || true
log_success "Локальные артефакты очищены."

# Step 6: Healthcheck Verification
log_step 6 6 "Проверка работоспособности сервиса (Healthcheck)"

if [ "$SKIP_DOCKER" -eq 0 ]; then
    log_info "Ожидание инициализации сервиса..."
    HEALTH_OK=0
    for i in {1..15}; do
        # Check container health status
        CONTAINER_STATUS=$(docker inspect --format='{{json .State.Health.Status}}' markflow 2>/dev/null || echo '"unknown"')
        if [ "$CONTAINER_STATUS" = '"healthy"' ]; then
            HEALTH_OK=1
            break
        fi

        # Direct HTTP probe fallback
        if curl -s -f -m 2 "http://127.0.0.1:${HTTP_PORT:-80}/" >/dev/null 2>&1 || \
           curl -s -f -m 2 -k "https://127.0.0.1:${HTTPS_PORT:-443}/" >/dev/null 2>&1; then
            HEALTH_OK=1
            break
        fi
        sleep 2
    done

    if [ "$HEALTH_OK" -eq 1 ]; then
        log_success "MarkFlow успешно отвечает на запросы и находится в статусе HEALTHY!"
    else
        log_warn "Сервер еще запускается или выполняет начальную фоновую индексацию базы знаний."
    fi
fi

# Final Summary Banner
echo -e "\n${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║               🎉 ОБНОВЛЕНИЕ MARKFLOW УСПЕШНО ЗАВЕРШЕНО!              ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  🌐 Доступ к базе знаний: ${BOLD}${CYAN}http://${DOMAIN_NAME:-localhost}${RESET}"
echo -e "  📁 Рабочая директория:   ${BOLD}${SCRIPT_DIR}${RESET}"
echo -e "  📊 Просмотр логов:       ${BOLD}docker logs markflow -f${RESET}"
echo ""

# Live logs stream if running interactively
if [ "$SKIP_DOCKER" -eq 0 ] && [ "$AUTO_MODE" -eq 0 ] && [ -t 0 ]; then
    echo -e "${YELLOW}Подключиться к просмотру живого потока логов? [Y/n]: ${RESET}\c"
    read -r answer
    if [[ ! "$answer" =~ ^[Nn]$ ]]; then
        echo -e "\n${CYAN}📡 Подключение к живому потоку логов (${BOLD}docker compose logs -f${RESET}${CYAN})...${RESET}"
        echo -e "${YELLOW}(Нажмите Ctrl+C для выхода из режима логов в любой момент)${RESET}\n"
        cd deploy && $DOCKER_COMPOSE --env-file ../.env logs -f --tail=50 markflow nginx || true
        cd ..
        echo -e "\n${GREEN}✔${RESET} Просмотр логов завершен. MarkFlow продолжает работу в фоновом режиме.\n"
    fi
fi
